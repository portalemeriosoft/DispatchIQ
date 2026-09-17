<?php

namespace App\Services\Twilio;

use App\Models\TwilioAccount;
use App\Models\TwilioNumber;
use App\Models\User;
use Illuminate\Support\Collection;
use Twilio\Exceptions\RestException;
use Twilio\Rest\Client;
use Twilio\Rest\Api\V2010\Account\MessageInstance;
use Twilio\Security\RequestValidator;

class MessagingService
{
    public function makeClient(string $accountSid, string $authToken): Client
    {
        return new Client($accountSid, $authToken);
    }

    public function clientForNumber(TwilioNumber $number): Client
    {
        $number->loadMissing('account');
        $account = $number->account;

        if (! $account || blank($account->account_sid) || blank($account->auth_token)) {
            throw new \InvalidArgumentException('Twilio account credentials are missing for this number.');
        }

        return $this->makeClient($account->account_sid, $account->auth_token);
    }

    public function findNumberByPhone(?string $phone, bool $activeOnly = true): ?TwilioNumber
    {
        if (! $phone) {
            return null;
        }

        $query = TwilioNumber::query()
            ->where('phone_number', $phone)
            ->with('account');

        if ($activeOnly) {
            $query->where('is_active', true);
        }

        return $query->first();
    }

    /**
     * Numbers the user may send from / see.
     *
     * @return Collection<int, TwilioNumber>
     */
    public function availableNumbersFor(?User $user): Collection
    {
        $query = TwilioNumber::query()
            ->where('is_active', true)
            ->whereHas('account', fn ($q) => $q->where('is_active', true))
            ->with('account')
            ->orderBy('friendly_name')
            ->orderBy('phone_number');

        if (! $user) {
            return collect();
        }

        if ($user->role === 'admin') {
            return $query->get();
        }

        return $query->whereHas('agents', fn ($q) => $q->where('users.id', $user->id))->get();
    }

    public function resolveSendNumber(?User $user, ?int $requestedNumberId, ?int $stickyNumberId = null): TwilioNumber
    {
        $available = $this->availableNumbersFor($user);

        if ($available->isEmpty()) {
            throw new \InvalidArgumentException(
                'No Twilio numbers available. Ask an admin to assign a number to your account.'
            );
        }

        if ($stickyNumberId) {
            $sticky = $available->firstWhere('id', $stickyNumberId);
            if ($sticky) {
                return $sticky;
            }

            throw new \InvalidArgumentException(
                'This conversation belongs to a Twilio number you are not assigned to.'
            );
        }

        if ($requestedNumberId) {
            $picked = $available->firstWhere('id', $requestedNumberId);
            if (! $picked) {
                throw new \InvalidArgumentException('Selected Twilio number is not available to you.');
            }

            return $picked;
        }

        if ($available->count() === 1) {
            return $available->first();
        }

        throw new \InvalidArgumentException(
            'Multiple Twilio numbers available — select which number to send from.'
        );
    }

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

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($scheme, ['http', 'https'], true);
    }

    public function webhookUrl(): string
    {
        return rtrim((string) config('app.url'), '/').'/api/webhooks/twilio/sms';
    }

    public function sendSms(string $to, string $body, TwilioNumber $fromNumber): MessageInstance
    {
        $client = $this->clientForNumber($fromNumber);

        $params = [
            'from' => $fromNumber->phone_number,
            'body' => $body,
        ];

        $statusCallback = $this->webhookUrl();
        if ($this->isPublicWebhookUrl($statusCallback)) {
            $params['statusCallback'] = $statusCallback;
        }

        return $client->messages->create($to, $params);
    }

    /**
     * @param  string|list<string>  $urls  Exact URL(s) Twilio may have signed (try several behind proxies).
     * @param  array<string, mixed>  $params
     */
    public function validateWebhookSignature(string $signature, string|array $urls, array $params, ?TwilioAccount $account = null): bool
    {
        if ($signature === '') {
            return false;
        }

        $urlList = array_values(array_unique(array_filter(is_array($urls) ? $urls : [$urls])));
        if ($urlList === []) {
            return false;
        }

        // Flatten to string map for Twilio validator (ignore nested junk).
        $flat = [];
        foreach ($params as $key => $value) {
            if (is_string($key) && (is_string($value) || is_numeric($value))) {
                $flat[$key] = (string) $value;
            }
        }

        $tokens = [];
        if ($account && filled($account->auth_token)) {
            $tokens[] = (string) $account->auth_token;
        } else {
            foreach (TwilioAccount::query()->where('is_active', true)->get() as $acc) {
                if (filled($acc->auth_token)) {
                    $tokens[] = (string) $acc->auth_token;
                }
            }
        }

        foreach ($tokens as $token) {
            $validator = new RequestValidator($token);
            foreach ($urlList as $url) {
                if ($validator->validate($signature, $url, $flat)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Serialize number for API responses.
     *
     * @return array<string, mixed>
     */
    public function numberPayload(TwilioNumber $number, bool $includeAgents = false): array
    {
        $payload = [
            'id' => $number->id,
            'phone_number' => $number->phone_number,
            'friendly_name' => $number->friendly_name,
            'label' => $number->displayLabel(),
        ];

        if (! $includeAgents) {
            return $payload;
        }

        $number->loadMissing(['account', 'agents:id,name,email,role']);

        return array_merge($payload, [
            'is_active' => $number->is_active,
            'webhook_configured_at' => $number->webhook_configured_at,
            'twilio_account_id' => $number->twilio_account_id,
            'account_label' => $number->account?->label,
            'agents' => $number->agents->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
            ])->values(),
        ]);
    }
}
