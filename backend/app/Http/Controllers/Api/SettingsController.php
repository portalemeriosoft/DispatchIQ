<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\Twilio\MessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function __construct(
        private readonly MessagingService $messaging,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $settings = Setting::query()->first();
        $numbers = $this->messaging->availableNumbersFor($request->user());

        return response()->json([
            'provider' => $settings?->provider ?? 'twilio',
            'default_country_code' => $settings?->default_country_code ?? '+61',
            'updated_at' => $settings?->updated_at,
            'available_numbers' => $numbers->map(fn ($n) => $this->messaging->numberPayload($n, includeAgents: false))->values(),
            'requires_number_selector' => $numbers->count() > 1,
            'default_twilio_number_id' => $numbers->count() === 1 ? $numbers->first()->id : null,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'provider' => ['sometimes', 'string', 'max:50'],
            'default_country_code' => ['required', 'string', 'max:10'],
        ]);

        $existing = Setting::query()->first();
        $payload = [
            'provider' => $data['provider'] ?? 'twilio',
            'default_country_code' => $data['default_country_code'],
        ];

        if ($existing) {
            $existing->fill($payload);
            $existing->save();
            $settings = $existing->fresh();
        } else {
            $settings = Setting::query()->create($payload);
        }

        return response()->json([
            'message' => 'Settings saved.',
            'settings' => [
                'provider' => $settings->provider,
                'default_country_code' => $settings->default_country_code,
                'updated_at' => $settings->updated_at,
            ],
        ]);
    }
}
