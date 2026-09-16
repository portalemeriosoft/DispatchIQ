<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Blacklist;
use App\Models\Contact;
use App\Models\DeliveryLog;
use App\Models\Message;
use App\Models\TwilioNumber;
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
        $isStatus = $this->isStatusCallback($request);

        $ourNumber = $this->resolveOurNumber($request, $isStatus);
        $account = $ourNumber?->account;

        if (! $this->messaging->validateWebhookSignature($signature, $url, $params, $account)) {
            $altUrl = $request->fullUrl();
            if ($altUrl === $url || ! $this->messaging->validateWebhookSignature($signature, $altUrl, $params, $account)) {
                Log::warning('Twilio webhook signature validation failed', [
                    'url' => $url,
                    'alt_url' => $altUrl,
                    'to' => $request->input('To'),
                    'from' => $request->input('From'),
                ]);

                return response('Invalid signature', 403);
            }
        }

        try {
            if ($isStatus) {
                $this->handleStatusCallback($request, $ourNumber);

                return response('OK', 200);
            }

            return $this->handleInboundSms($request, $ourNumber);
        } catch (\Throwable $e) {
            Log::error('Twilio webhook processing failed', [
                'error' => $e->getMessage(),
                'message_sid' => $request->input('MessageSid') ?: $request->input('SmsSid'),
                'message_status' => $request->input('MessageStatus') ?: $request->input('SmsStatus'),
            ]);

            return response('OK', 200);
        }
    }

    private function resolveOurNumber(Request $request, bool $isStatusCallback): ?TwilioNumber
    {
        // Status callbacks: From = our line. Inbound SMS: To = our line.
        $phone = $isStatusCallback
            ? (string) $request->input('From', '')
            : (string) $request->input('To', '');

        if ($phone === '') {
            return null;
        }

        // Accept inbound even if the number was later marked inactive.
        return $this->messaging->findNumberByPhone($phone, activeOnly: false);
    }

    private function isStatusCallback(Request $request): bool
    {
        return $request->filled('MessageStatus') && ! $request->has('Body');
    }

    private function handleStatusCallback(Request $request, ?TwilioNumber $ourNumber): void
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

        $message = Message::query()->where('twilio_message_sid', $sid)->first();
        $numberId = $message?->twilio_number_id ?? $ourNumber?->id;

        if (! $numberId || ! $to) {
            DeliveryLog::query()
                ->where('twilio_sid', $sid)
                ->update([
                    'carrier_status' => $status,
                    'error_code' => $errorCode ? (string) $errorCode : null,
                ]);

            return;
        }

        DeliveryLog::query()->updateOrCreate(
            ['twilio_sid' => $sid],
            [
                'campaign_id' => null,
                'twilio_number_id' => $numberId,
                'recipient_number' => $to,
                'message_body' => $message?->body ?? '',
                'carrier_status' => $status,
                'error_code' => $errorCode ? (string) $errorCode : null,
                'is_blacklisted' => Blacklist::query()->where('phone_number', $to)->exists(),
            ]
        );
    }

    private function handleInboundSms(Request $request, ?TwilioNumber $ourNumber): Response
    {
        $from = (string) $request->input('From', '');
        $to = (string) $request->input('To', '');
        $body = trim((string) $request->input('Body', ''));
        $sid = $request->input('MessageSid') ?: $request->input('SmsSid');

        if ($from === '') {
            return response('OK', 200);
        }

        if (! $ourNumber) {
            $ourNumber = $this->messaging->findNumberByPhone($to, activeOnly: false);
        }

        if (! $ourNumber) {
            Log::warning('Inbound SMS to unknown Twilio number', [
                'to' => $to,
                'from' => $from,
                'sid' => $sid,
            ]);

            return response('OK', 200);
        }

        $contact = Contact::query()->firstOrCreate(
            ['phone_number' => $from],
            [
                'name' => $from,
                'lead_status' => 'lead',
                'tags' => [],
                'last_twilio_number_id' => $ourNumber->id,
            ]
        );

        if ((int) $contact->last_twilio_number_id !== (int) $ourNumber->id) {
            $contact->update(['last_twilio_number_id' => $ourNumber->id]);
        }

        $messageAttributes = [
            'contact_id' => $contact->id,
            'twilio_number_id' => $ourNumber->id,
            'from_number' => $from,
            'to_number' => $ourNumber->phone_number,
            'sent_by' => null,
            'direction' => 'inbound',
            'body' => $body,
            'status' => $request->input('SmsStatus', 'received'),
        ];

        if ($sid) {
            Message::query()->updateOrCreate(
                ['twilio_message_sid' => $sid],
                $messageAttributes
            );
        } else {
            Message::query()->create($messageAttributes);
        }

        if ($this->isOptOut($body)) {
            return $this->handleOptOut($contact, $from, $body, $ourNumber);
        }

        return response('OK', 200);
    }

    private function isOptOut(string $body): bool
    {
        $normalized = strtoupper(trim($body));

        return in_array($normalized, self::OPT_OUT_KEYWORDS, true);
    }

    private function handleOptOut(Contact $contact, string $from, string $body, TwilioNumber $ourNumber): Response
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
            $twilioMessage = $this->messaging->sendSms($from, $confirmation, $ourNumber);

            Message::query()->updateOrCreate(
                ['twilio_message_sid' => $twilioMessage->sid],
                [
                    'contact_id' => $contact->id,
                    'twilio_number_id' => $ourNumber->id,
                    'from_number' => $ourNumber->phone_number,
                    'to_number' => $from,
                    'sent_by' => null,
                    'direction' => 'outbound',
                    'body' => $confirmation,
                    'status' => $twilioMessage->status ?? 'queued',
                ]
            );

            DeliveryLog::query()->updateOrCreate(
                ['twilio_sid' => $twilioMessage->sid],
                [
                    'campaign_id' => null,
                    'twilio_number_id' => $ourNumber->id,
                    'recipient_number' => $from,
                    'message_body' => $confirmation,
                    'carrier_status' => $twilioMessage->status ?? 'queued',
                    'error_code' => null,
                    'is_blacklisted' => true,
                ]
            );
        } catch (\Throwable $e) {
            Log::warning('Failed to send opt-out confirmation', [
                'to' => $from,
                'error' => $e->getMessage(),
            ]);

            $twiml = new MessagingResponse;
            $twiml->message($confirmation);

            return response($twiml->asXML(), 200)->header('Content-Type', 'text/xml');
        }

        return response('OK', 200);
    }
}
