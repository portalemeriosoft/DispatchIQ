<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TwilioAccount;
use App\Models\TwilioNumber;
use App\Models\User;
use App\Services\Twilio\MessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TwilioNumberController extends Controller
{
    public function __construct(
        private readonly MessagingService $messaging,
    ) {}

    /**
     * Numbers available to the current user (for selectors).
     */
    public function available(Request $request): JsonResponse
    {
        $numbers = $this->messaging->availableNumbersFor($request->user());

        return response()->json([
            'numbers' => $numbers->map(fn ($n) => $this->messaging->numberPayload($n, includeAgents: false))->values(),
            'requires_number_selector' => $numbers->count() > 1,
            'default_twilio_number_id' => $numbers->count() === 1 ? $numbers->first()->id : null,
        ]);
    }

    /**
     * Admin: full inventory of accounts + numbers + assignments.
     */
    public function index(): JsonResponse
    {
        $accounts = TwilioAccount::query()
            ->with(['numbers' => fn ($q) => $q->with('agents:id,name,email,role')->orderBy('phone_number')])
            ->orderBy('id')
            ->get();

        return response()->json([
            'accounts' => $accounts->map(fn (TwilioAccount $account) => $this->accountPayload($account)),
            'agents' => User::query()
                ->where('role', 'agent')
                ->orderBy('agent_code')
                ->get(['id', 'name', 'email', 'role', 'agent_code']),
        ]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:255'],
            'account_sid' => ['required', 'string', 'max:255'],
            'auth_token' => ['required', 'string', 'max:255'],
            'phone_number' => [
                'required',
                'string',
                'regex:/^\+[1-9]\d{1,14}$/',
                Rule::unique('twilio_numbers', 'phone_number'),
            ],
            'friendly_name' => ['nullable', 'string', 'max:255'],
            'agent_ids' => ['sometimes', 'array'],
            'agent_ids.*' => ['integer', 'exists:users,id'],
        ], [
            'phone_number.regex' => 'Phone number must be in E.164 format (e.g. +61412345678).',
            'phone_number.unique' => 'This Twilio number is already configured.',
        ]);

        $result = $this->configureNumber(
            $data['account_sid'],
            $data['auth_token'],
            $data['phone_number'],
        );

        $account = DB::transaction(function () use ($data, $result) {
            $account = TwilioAccount::query()->create([
                'label' => $data['label'] ?: 'Twilio Account',
                'account_sid' => $data['account_sid'],
                'auth_token' => $data['auth_token'],
                'is_active' => true,
            ]);

            $number = TwilioNumber::query()->create([
                'twilio_account_id' => $account->id,
                'phone_number' => $data['phone_number'],
                'friendly_name' => $data['friendly_name'] ?: $data['phone_number'],
                'is_active' => true,
                'webhook_configured_at' => ($result['webhook_configured'] ?? false) ? now() : null,
            ]);

            $this->syncAgents($number, $data['agent_ids'] ?? []);

            return $account->fresh(['numbers.agents:id,name,email,role']);
        });

        return response()->json([
            'message' => ($result['webhook_configured'] ?? false)
                ? 'Twilio account and number added. SMS webhook configured.'
                : 'Twilio account and number added. Webhook skipped because APP_URL is localhost — use a public HTTPS URL for inbound SMS.',
            'webhook_configured' => (bool) ($result['webhook_configured'] ?? false),
            'webhook_url' => $this->messaging->webhookUrl(),
            'account' => $this->accountPayload($account),
        ], 201);
    }

    public function updateAccount(Request $request, TwilioAccount $account): JsonResponse
    {
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:255'],
            'account_sid' => ['sometimes', 'string', 'max:255'],
            'auth_token' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('label', $data)) {
            $account->label = $data['label'] ?: $account->label;
        }

        if (! empty($data['account_sid'])) {
            $account->account_sid = $data['account_sid'];
        }

        $token = $data['auth_token'] ?? null;
        $tokenIsPlaceholder = blank($token)
            || preg_match('/^•+$/u', (string) $token) === 1
            || str_starts_with((string) $token, '••••');

        if (! $tokenIsPlaceholder && filled($token)) {
            $account->auth_token = $token;
        }

        if (array_key_exists('is_active', $data)) {
            $account->is_active = (bool) $data['is_active'];
        }

        $account->save();

        return response()->json([
            'message' => 'Twilio account updated.',
            'account' => $this->accountPayload($account->fresh(['numbers.agents:id,name,email,role'])),
        ]);
    }

    public function destroyAccount(TwilioAccount $account): JsonResponse
    {
        $account->delete();

        return response()->json(['message' => 'Twilio account and its numbers removed.']);
    }

    public function storeNumber(Request $request, TwilioAccount $account): JsonResponse
    {
        $data = $request->validate([
            'phone_number' => ['required', 'string', 'regex:/^\+[1-9]\d{1,14}$/', 'unique:twilio_numbers,phone_number'],
            'friendly_name' => ['nullable', 'string', 'max:255'],
            'agent_ids' => ['sometimes', 'array'],
            'agent_ids.*' => ['integer', 'exists:users,id'],
        ], [
            'phone_number.regex' => 'Phone number must be in E.164 format (e.g. +61412345678).',
        ]);

        $result = $this->configureNumber(
            $account->account_sid,
            $account->auth_token,
            $data['phone_number'],
        );

        $number = TwilioNumber::query()->create([
            'twilio_account_id' => $account->id,
            'phone_number' => $data['phone_number'],
            'friendly_name' => $data['friendly_name'] ?: $data['phone_number'],
            'is_active' => true,
            'webhook_configured_at' => ($result['webhook_configured'] ?? false) ? now() : null,
        ]);

        $this->syncAgents($number, $data['agent_ids'] ?? []);

        return response()->json([
            'message' => ($result['webhook_configured'] ?? false)
                ? 'Number added and webhook configured.'
                : 'Number added. Webhook skipped because APP_URL is localhost.',
            'webhook_configured' => (bool) ($result['webhook_configured'] ?? false),
            'number' => $this->messaging->numberPayload($number->fresh(['account', 'agents:id,name,email,role']), includeAgents: true),
        ], 201);
    }

    public function updateNumber(Request $request, TwilioNumber $number): JsonResponse
    {
        $data = $request->validate([
            'friendly_name' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'agent_ids' => ['sometimes', 'array'],
            'agent_ids.*' => ['integer', 'exists:users,id'],
            'reconfigure_webhook' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('friendly_name', $data)) {
            $number->friendly_name = $data['friendly_name'] ?: $number->phone_number;
        }

        if (array_key_exists('is_active', $data)) {
            $number->is_active = (bool) $data['is_active'];
        }

        $webhookConfigured = null;
        if (! empty($data['reconfigure_webhook'])) {
            $number->loadMissing('account');
            $result = $this->configureNumber(
                $number->account->account_sid,
                $number->account->auth_token,
                $number->phone_number,
            );
            $webhookConfigured = (bool) ($result['webhook_configured'] ?? false);
            if ($webhookConfigured) {
                $number->webhook_configured_at = now();
            }
        }

        $number->save();

        if (array_key_exists('agent_ids', $data)) {
            $this->syncAgents($number, $data['agent_ids'] ?? []);
        }

        return response()->json([
            'message' => 'Number updated.',
            'webhook_configured' => $webhookConfigured,
            'number' => $this->messaging->numberPayload($number->fresh(['account', 'agents:id,name,email,role']), includeAgents: true),
        ]);
    }

    public function destroyNumber(TwilioNumber $number): JsonResponse
    {
        $number->delete();

        return response()->json(['message' => 'Number removed.']);
    }

    /**
     * @param  list<int|string>  $agentIds
     */
    private function syncAgents(TwilioNumber $number, array $agentIds): void
    {
        $ids = User::query()
            ->where('role', 'agent')
            ->whereIn('id', $agentIds)
            ->pluck('id')
            ->all();

        $number->agents()->sync($ids);
    }

    /**
     * @return array<string, mixed>
     */
    private function configureNumber(string $accountSid, string $authToken, string $phoneNumber): array
    {
        try {
            return $this->messaging->configureSenderWebhook(
                $accountSid,
                $authToken,
                $phoneNumber,
                $this->messaging->webhookUrl(),
            );
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'twilio' => [$e->getMessage()],
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function accountPayload(TwilioAccount $account): array
    {
        $account->loadMissing(['numbers.agents:id,name,email,role']);

        return [
            'id' => $account->id,
            'label' => $account->label,
            'account_sid' => $account->account_sid
                ? substr($account->account_sid, 0, 4).str_repeat('•', max(0, strlen($account->account_sid) - 8)).substr($account->account_sid, -4)
                : null,
            'account_sid_set' => filled($account->account_sid),
            'auth_token_set' => filled($account->auth_token),
            'is_active' => $account->is_active,
            'numbers' => $account->numbers->map(fn (TwilioNumber $n) => $this->messaging->numberPayload($n, includeAgents: true))->values(),
            'created_at' => $account->created_at,
            'updated_at' => $account->updated_at,
        ];
    }
}
