<?php

namespace App\Services\Twilio;

use App\Models\Setting;
use Twilio\Exceptions\RestException;
use Twilio\Rest\Client;
use Twilio\Rest\Api\V2010\Account\MessageInstance;
use Twilio\Security\RequestValidator;

/**
 * SMS messaging via Twilio. VoiceService can sit alongside this later
 * without touching SMS code.
 */
class MessagingService
{
    public function makeClient(string $accountSid, string $authToken): Client
    {
        return new Client($accountSid, $authToken);
    }

    public function settings(): ?Setting
    {
        return Setting::query()->first();
    }

    public function clientFromSettings(?Setting $settings = null): Client
    {
        $settings ??= $this->settings();

        if (! $settings || blank($settings->twilio_account_sid) || blank($settings->twilio_auth_token)) {
            throw new \InvalidArgumentException(
                'Twilio is not configured. Save credentials in Dynamic Settings first.'
            );
        }

        if (blank($settings->sender_number)) {
            throw new \InvalidArgumentException(
                'No active sender phone number configured in Dynamic Settings.'
            );
        }

        return $this->makeClient($settings->twilio_account_sid, $settings->twilio_auth_token);
    }

    /**
     * Validate credentials, ensure the sender number exists and is SMS-capable,
     * then point its SmsUrl at our webhook when APP_URL is publicly reachable.
     * Localhost / private URLs skip the Twilio SmsUrl write (Twilio rejects them).
     *
     * @return array{sid: string, phone_number: string, webhook_configured: bool}
     */
    public function configureSenderWebhook(
        string $accountSid,
        string $authToken,
        string $senderNumber,
        string $smsWebhookUrl,
    ): array {
        $client = $this->makeClient($accountSid, $authToken);

        try {
            $numbers = $client->incomingPhoneNumbers->read([
                'phoneNumber' => $senderNumber,
            ], 20);
        } catch (RestException $e) {
            if ($e->getStatusCode() === 401 || $e->getStatusCode() === 403) {
                throw new \InvalidArgumentException(
                    'Twilio rejected these credentials. Check Account SID and Auth Token.'
                );
            }

            throw new \InvalidArgumentException(
                'Failed to reach Twilio: '.$e->getMessage()
            );
        }

        $incoming = collect($numbers)->first(
            fn ($number) => $number->phoneNumber === $senderNumber
        );

        if (! $incoming) {
            throw new \InvalidArgumentException(
                "Phone number {$senderNumber} was not found on this Twilio account."
            );
        }

        $capabilities = $incoming->capabilities;
        $smsEnabled = is_array($capabilities)
            ? (bool) ($capabilities['sms'] ?? false)
            : (bool) ($capabilities->sms ?? false);

        if (! $smsEnabled) {
            throw new \InvalidArgumentException(
                "Phone number {$senderNumber} is not SMS-capable on this Twilio account."
            );
        }

        $webhookConfigured = false;

        if ($this->isPublicWebhookUrl($smsWebhookUrl)) {
            try {
                $incoming->update([
                    'smsUrl' => $smsWebhookUrl,
                    'smsMethod' => 'POST',
                    'statusCallback' => $smsWebhookUrl,
                    'statusCallbackMethod' => 'POST',
                ]);
                $webhookConfigured = true;
            } catch (RestException $e) {
                throw new \InvalidArgumentException(
                    'Failed to update Twilio SMS webhook URL: '.$e->getMessage()
                );
            }
        }

        return [
            'sid' => $incoming->sid,
            'phone_number' => $incoming->phoneNumber,
            'webhook_configured' => $webhookConfigured,
        ];
    }

    public function isPublicWebhookUrl(string $url): bool
    {
        $host = parse_url($url, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            return false;
        }

        $host = strtolower($host);

        if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return false;
        }

        if (str_ends_with($host, '.local') || str_ends_with($host, '.test')) {
            return false;
        }

        // Twilio requires a publicly reachable URL (prefer HTTPS in production).
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($scheme, ['http', 'https'], true);
    }

    public function webhookUrl(): string
    {
        return rtrim((string) config('app.url'), '/').'/api/webhooks/twilio/sms';
    }

    /**
     * @throws \InvalidArgumentException
     * @throws RestException
     */
    public function sendSms(string $to, string $body, ?Setting $settings = null): MessageInstance
    {
        $settings ??= $this->settings();
        $client = $this->clientFromSettings($settings);

        $params = [
            'from' => $settings->sender_number,
            'body' => $body,
        ];

        // Twilio rejects localhost / private StatusCallback URLs (error 21609).
        $statusCallback = $this->webhookUrl();
        if ($this->isPublicWebhookUrl($statusCallback)) {
            $params['statusCallback'] = $statusCallback;
        }

        return $client->messages->create($to, $params);
    }

    public function validateWebhookSignature(string $signature, string $url, array $params): bool
    {
        $settings = $this->settings();

        if (! $settings || blank($settings->twilio_auth_token)) {
            return false;
        }

        $validator = new RequestValidator($settings->twilio_auth_token);

        return $validator->validate($signature, $url, $params);
    }
}
