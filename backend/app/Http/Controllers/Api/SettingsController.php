<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\Twilio\MessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SettingsController extends Controller
{
    public function __construct(
        private readonly MessagingService $messaging,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $settings = Setting::query()->first();

        // Agents only get carrier display fields — no Twilio secrets.
        if ($request->user()?->role !== 'admin') {
            return response()->json([
                'provider' => $settings?->provider ?? 'twilio',
                'sender_number' => $settings?->sender_number,
                'default_country_code' => $settings?->default_country_code,
                'twilio_auth_token_set' => filled($settings?->twilio_auth_token),
            ]);
        }

        return response()->json([
            'provider' => $settings?->provider ?? 'twilio',
            'twilio_account_sid' => $settings?->twilio_account_sid,
            'twilio_auth_token' => $settings?->twilio_auth_token
                ? '••••••••••••••••'
                : null,
            'twilio_auth_token_set' => filled($settings?->twilio_auth_token),
            'sender_number' => $settings?->sender_number,
            'default_country_code' => $settings?->default_country_code,
            'updated_at' => $settings?->updated_at,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'provider' => ['sometimes', 'string', 'max:50'],
            'twilio_account_sid' => ['required', 'string', 'max:255'],
            'twilio_auth_token' => ['nullable', 'string', 'max:255'],
            'sender_number' => ['required', 'string', 'regex:/^\+[1-9]\d{1,14}$/'],
            'default_country_code' => ['required', 'string', 'max:10'],
        ], [
            'sender_number.regex' => 'Sender number must be in E.164 format (e.g. +61412345678).',
        ]);

        $existing = Setting::query()->first();
        $authToken = $data['twilio_auth_token'] ?? null;

        $tokenIsPlaceholder = blank($authToken)
            || preg_match('/^•+$/u', $authToken) === 1
            || str_starts_with((string) $authToken, '••••');

        if ($tokenIsPlaceholder) {
            if (! $existing || blank($existing->twilio_auth_token)) {
                throw ValidationException::withMessages([
                    'twilio_auth_token' => ['Auth Token is required.'],
                ]);
            }
            $authToken = $existing->twilio_auth_token;
        }

        $webhookUrl = rtrim((string) config('app.url'), '/').'/api/webhooks/twilio/sms';

        try {
            $result = $this->messaging->configureSenderWebhook(
                $data['twilio_account_sid'],
                $authToken,
                $data['sender_number'],
                $webhookUrl,
            );
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'twilio' => [$e->getMessage()],
            ]);
        }

        $payload = [
            'provider' => $data['provider'] ?? 'twilio',
            'twilio_account_sid' => $data['twilio_account_sid'],
            'twilio_auth_token' => $authToken,
            'sender_number' => $data['sender_number'],
            'default_country_code' => $data['default_country_code'],
        ];

        if ($existing) {
            $existing->fill($payload);
            $existing->save();
            $settings = $existing->fresh();
        } else {
            $settings = Setting::query()->create($payload);
        }

        $webhookConfigured = (bool) ($result['webhook_configured'] ?? false);

        return response()->json([
            'message' => $webhookConfigured
                ? 'Settings saved. Twilio SMS webhook configured.'
                : 'Settings saved. Twilio credentials verified. Webhook skipped because APP_URL is localhost — use ngrok (or a public HTTPS URL) for inbound SMS and delivery status callbacks.',
            'webhook_configured' => $webhookConfigured,
            'webhook_url' => $webhookUrl,
            'settings' => [
                'provider' => $settings->provider,
                'twilio_account_sid' => $settings->twilio_account_sid,
                'twilio_auth_token' => '••••••••••••••••',
                'twilio_auth_token_set' => true,
                'sender_number' => $settings->sender_number,
                'default_country_code' => $settings->default_country_code,
                'updated_at' => $settings->updated_at,
            ],
        ]);
    }
}
