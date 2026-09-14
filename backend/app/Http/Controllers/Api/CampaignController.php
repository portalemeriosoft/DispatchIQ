<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessCampaignJob;
use App\Models\Campaign;
use App\Models\Setting;
use App\Services\PhoneNumberNormalizer;
use App\Services\Twilio\MessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CampaignController extends Controller
{
    public function __construct(
        private readonly PhoneNumberNormalizer $normalizer,
        private readonly MessagingService $messaging,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Campaign::query()
            ->with('creator:id,name,email,agent_code')
            ->latest();

        if ($request->user()?->role !== 'admin') {
            $query->where('created_by', $request->user()->id);
        }

        $campaigns = $query->paginate((int) $request->query('per_page', 20));

        return response()->json($campaigns);
    }

    public function show(Request $request, Campaign $campaign): JsonResponse
    {
        if (
            $request->user()?->role !== 'admin'
            && (int) $campaign->created_by !== (int) $request->user()->id
        ) {
            abort(403, 'You can only view your own campaigns.');
        }

        $campaign->load(['creator:id,name,email,agent_code', 'deliveryLogs']);

        return response()->json($campaign);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['required', Rule::in(['paste', 'csv', 'single'])],
            'name' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:1600'],
            'recipients' => ['sometimes', 'array', 'min:1'],
            'recipients.*' => ['string', 'max:40'],
            'recipient' => ['sometimes', 'nullable', 'string', 'max:40'],
            'throttle_delay_ms' => ['required', 'integer', 'min:0', 'max:10000'],
            'scheduled_at' => ['nullable', 'date', 'after:now'],
            'csv_file' => ['sometimes', 'file', 'mimes:csv,txt', 'max:5120'],
        ]);

        $rawRecipients = $this->extractRecipients($request, $data);

        if (count($rawRecipients) === 0) {
            throw ValidationException::withMessages([
                'recipients' => ['Provide at least one recipient phone number.'],
            ]);
        }

        $settings = Setting::query()->first();
        $defaultPrefix = $settings?->default_country_code ?: '+61';

        $recipients = $this->normalizer->normalizeMany($rawRecipients, $defaultPrefix);

        if (count($recipients) === 0) {
            throw ValidationException::withMessages([
                'recipients' => ['No valid phone numbers found after normalization.'],
            ]);
        }

        // Ensure Twilio is configured before queueing (avoid silent campaign failures).
        try {
            $this->messaging->clientFromSettings($settings);
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'twilio' => [$e->getMessage()],
            ]);
        }

        $scheduledAt = isset($data['scheduled_at'])
            ? Carbon::parse($data['scheduled_at'])
            : null;

        $campaign = Campaign::query()->create([
            'name' => $data['name'] ?? null,
            'created_by' => $request->user()->id,
            'total_recipients' => count($recipients),
            'throttle_delay_ms' => $data['throttle_delay_ms'],
            'status' => 'pending',
            'scheduled_at' => $scheduledAt,
        ]);

        $pendingDispatch = ProcessCampaignJob::dispatch(
            $campaign->id,
            $recipients,
            $data['body'],
            $request->user()->id,
        );

        if ($scheduledAt) {
            $pendingDispatch->delay($scheduledAt);
        }

        return response()->json([
            'message' => $scheduledAt
                ? 'Campaign scheduled.'
                : 'Campaign queued for dispatch.',
            'campaign' => $campaign->fresh('creator:id,name,email'),
            'recipients_normalized' => count($recipients),
            'default_country_code' => $defaultPrefix,
        ], 201);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return list<string>
     */
    private function extractRecipients(Request $request, array $data): array
    {
        $mode = $data['mode'];

        if ($mode === 'single') {
            $single = $data['recipient'] ?? ($data['recipients'][0] ?? null);

            return $single ? [(string) $single] : [];
        }

        if ($mode === 'csv' && $request->hasFile('csv_file')) {
            return $this->parseCsvFile($request->file('csv_file')->getRealPath());
        }

        $recipients = $data['recipients'] ?? [];

        // Allow a single textarea string with commas/newlines.
        if (count($recipients) === 1 && (str_contains($recipients[0], "\n") || str_contains($recipients[0], ','))) {
            return $this->splitRecipientBlob($recipients[0]);
        }

        if (is_string($request->input('recipients_text'))) {
            return $this->splitRecipientBlob($request->input('recipients_text'));
        }

        return array_map('strval', $recipients);
    }

    /**
     * @return list<string>
     */
    private function splitRecipientBlob(string $blob): array
    {
        $parts = preg_split('/[\s,;]+/', $blob) ?: [];

        return array_values(array_filter(array_map('trim', $parts)));
    }

    /**
     * @return list<string>
     */
    private function parseCsvFile(string $path): array
    {
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw ValidationException::withMessages([
                'csv_file' => ['Unable to read CSV file.'],
            ]);
        }

        $numbers = [];
        $header = null;
        $phoneIndex = 0;

        while (($row = fgetcsv($handle)) !== false) {
            if ($row === [null] || $row === false) {
                continue;
            }

            if ($header === null) {
                $normalizedHeader = array_map(
                    fn ($col) => strtolower(trim((string) $col)),
                    $row
                );

                if (in_array('phone_number', $normalizedHeader, true) || in_array('phone', $normalizedHeader, true)) {
                    $header = $normalizedHeader;
                    $phoneIndex = array_search('phone_number', $header, true);
                    if ($phoneIndex === false) {
                        $phoneIndex = array_search('phone', $header, true);
                    }
                    $phoneIndex = $phoneIndex === false ? 0 : $phoneIndex;

                    continue;
                }

                // No header — treat first cell as phone.
                $header = [];
                $phoneIndex = 0;
            }

            $value = trim((string) ($row[$phoneIndex] ?? ''));
            if ($value !== '' && ! in_array(strtolower($value), ['phone_number', 'phone'], true)) {
                $numbers[] = $value;
            }
        }

        fclose($handle);

        return $numbers;
    }
}
