<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Blacklist;
use App\Models\Contact;
use App\Models\DeliveryLog;
use App\Models\Message;
use App\Services\Twilio\MessagingService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Twilio\TwiML\MessagingResponse;

class TwilioWebhookController extends Controller
{
    private const OPT_OUT_KEYWORDS = [
        'STOP',
        'STOPALL',
        'UNSUBSCRIBE',
        'CANCEL',
        'END',
        'QUIT',
    ];

    public function __construct(
        private readonly MessagingService $messaging,
    ) {}

    public function __invoke(Request $request): Response
    {
        $signature = (string) $request->header('X-Twilio-Signature', '');
        $url = $this->messaging->webhookUrl();
        $params = $request->post();

        // Prefer the public APP_URL (what Twilio called). Fall back to request URL.
        if (! $this->messaging->validateWebhookSignature($signature, $url, $params)) {
            $altUrl = $request->fullUrl();
            if ($altUrl === $url || ! $this->messaging->validateWebhookSignature($signature, $altUrl, $params)) {
                Log::warning('Twilio webhook signature validation failed', [
                    'url' => $url,
                    'alt_url' => $altUrl,
                ]);

                return response('Invalid signature', 403);
            }
        }

        try {
            if ($this->isStatusCallback($request)) {
                $this->handleStatusCallback($request);

                return response('OK', 200);
            }

            return $this->handleInboundSms($request);
        } catch (\Throwable $e) {
            Log::error('Twilio webhook processing failed', [
                'error' => $e->getMessage(),
                'payload' => $request->except([]),
            ]);

            return response('OK', 200);
        }
    }

    private function isStatusCallback(Request $request): bool
    {
        return $request->filled('MessageStatus') && ! $request->filled('Body');
    }

    private function handleStatusCallback(Request $request): void
    {
        $sid = $request->input('MessageSid') ?: $request->input('SmsSid');
        $status = $request->input('MessageStatus') ?: $request->input('SmsStatus');
        $errorCode = $request->input('ErrorCode');
        $to = $request->input('To');

        if (! $sid) {
            return;
        }

        Message::query()
            ->where('twilio_message_sid', $sid)
            ->update([
                'status' => $status,
            ]);

        $updated = DeliveryLog::query()
            ->where('twilio_sid', $sid)
            ->update([
                'carrier_status' => $status,
                'error_code' => $errorCode ? (string) $errorCode : null,
            ]);

        // If a status arrives before/without a matching log row, create one.
        if ($updated === 0 && $to) {
            $message = Message::query()->where('twilio_message_sid', $sid)->first();

            DeliveryLog::query()->create([
                'campaign_id' => null,
                'recipient_number' => $to,
                'message_body' => $message?->body ?? '',
                'twilio_sid' => $sid,
                'carrier_status' => $status,
                'error_code' => $errorCode ? (string) $errorCode : null,
                'is_blacklisted' => Blacklist::query()->where('phone_number', $to)->exists(),
            ]);
        }
    }

    private function handleInboundSms(Request $request): Response
    {
        $from = (string) $request->input('From', '');
        $body = trim((string) $request->input('Body', ''));
        $sid = $request->input('MessageSid') ?: $request->input('SmsSid');

        if ($from === '') {
            return response('OK', 200);
        }

        $contact = Contact::query()->firstOrCreate(
            ['phone_number' => $from],
            [
                'name' => $from,
                'lead_status' => 'lead',
                'tags' => [],
            ]
        );

        Message::query()->create([
            'contact_id' => $contact->id,
            'sent_by' => null,
            'direction' => 'inbound',
            'body' => $body,
            'twilio_message_sid' => $sid,
            'status' => $request->input('SmsStatus', 'received'),
        ]);

        if ($this->isOptOut($body)) {
            return $this->handleOptOut($contact, $from, $body);
        }

        return response('OK', 200);
    }

    private function isOptOut(string $body): bool
    {
        $normalized = strtoupper(trim($body));

        return in_array($normalized, self::OPT_OUT_KEYWORDS, true);
    }

    private function handleOptOut(Contact $contact, string $from, string $body): Response
    {
        Blacklist::query()->firstOrCreate(
            ['phone_number' => $from],
            ['reason' => 'Contact replied '.$body]
        );

        DeliveryLog::query()
            ->where('recipient_number', $from)
            ->update(['is_blacklisted' => true]);

        $confirmation = 'You have been unsubscribed and will no longer receive messages from us. Reply START to re-subscribe.';

        try {
            $twilioMessage = $this->messaging->sendSms($from, $confirmation);

            Message::query()->create([
                'contact_id' => $contact->id,
                'sent_by' => null,
                'direction' => 'outbound',
                'body' => $confirmation,
                'twilio_message_sid' => $twilioMessage->sid,
                'status' => $twilioMessage->status ?? 'queued',
            ]);

            DeliveryLog::query()->create([
                'campaign_id' => null,
                'recipient_number' => $from,
                'message_body' => $confirmation,
                'twilio_sid' => $twilioMessage->sid,
                'carrier_status' => $twilioMessage->status ?? 'queued',
                'error_code' => null,
                'is_blacklisted' => true,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to send opt-out confirmation', [
                'to' => $from,
                'error' => $e->getMessage(),
            ]);

            // Still acknowledge with TwiML as a fallback reply channel.
            $twiml = new MessagingResponse;
            $twiml->message($confirmation);

            return response($twiml->asXML(), 200)->header('Content-Type', 'text/xml');
        }

        return response('OK', 200);
    }
}
