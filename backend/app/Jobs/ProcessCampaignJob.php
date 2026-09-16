<?php

namespace App\Jobs;

use App\Models\Blacklist;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\DeliveryLog;
use App\Models\Message;
use App\Models\TwilioNumber;
use App\Services\Twilio\MessagingService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Twilio\Exceptions\RestException;

class ProcessCampaignJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    /**
     * @param  list<string>  $recipients
     */
    public function __construct(
        public int $campaignId,
        public array $recipients,
        public string $body,
        public ?int $sentByUserId = null,
    ) {}

    public function handle(MessagingService $messaging): void
    {
        $campaign = Campaign::query()->with('twilioNumber.account')->find($this->campaignId);

        if (! $campaign) {
            return;
        }

        $fromNumber = $campaign->twilioNumber;
        if (! $fromNumber) {
            $campaign->update(['status' => 'failed']);
            Log::error('Campaign missing Twilio number', ['campaign_id' => $campaign->id]);

            return;
        }

        $campaign->update(['status' => 'running']);

        $delayMs = max(0, (int) $campaign->throttle_delay_ms);
        $failed = 0;

        foreach ($this->recipients as $index => $number) {
            try {
                $this->sendOne($messaging, $campaign, $fromNumber, $number);
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('Campaign SMS failed', [
                    'campaign_id' => $campaign->id,
                    'to' => $number,
                    'error' => $e->getMessage(),
                ]);

                if (! $e instanceof RestException) {
                    DeliveryLog::query()->create([
                        'campaign_id' => $campaign->id,
                        'twilio_number_id' => $fromNumber->id,
                        'recipient_number' => $number,
                        'message_body' => $this->body,
                        'twilio_sid' => null,
                        'carrier_status' => 'failed',
                        'error_code' => 'local_error',
                        'is_blacklisted' => false,
                    ]);
                }
            }

            if ($delayMs > 0 && $index < count($this->recipients) - 1) {
                usleep($delayMs * 1000);
            }
        }

        $campaign->update([
            'status' => $failed === count($this->recipients) && $failed > 0
                ? 'failed'
                : 'completed',
        ]);
    }

    private function sendOne(
        MessagingService $messaging,
        Campaign $campaign,
        TwilioNumber $fromNumber,
        string $number,
    ): void {
        if (Blacklist::query()->where('phone_number', $number)->exists()) {
            DeliveryLog::query()->create([
                'campaign_id' => $campaign->id,
                'twilio_number_id' => $fromNumber->id,
                'recipient_number' => $number,
                'message_body' => $this->body,
                'twilio_sid' => null,
                'carrier_status' => 'blacklisted',
                'error_code' => 'opt_out',
                'is_blacklisted' => true,
            ]);

            return;
        }

        try {
            $twilioMessage = $messaging->sendSms($number, $this->body, $fromNumber);
        } catch (RestException $e) {
            DeliveryLog::query()->create([
                'campaign_id' => $campaign->id,
                'twilio_number_id' => $fromNumber->id,
                'recipient_number' => $number,
                'message_body' => $this->body,
                'twilio_sid' => null,
                'carrier_status' => 'failed',
                'error_code' => (string) ($e->getCode() ?: 'twilio_error'),
                'is_blacklisted' => false,
            ]);

            throw $e;
        }

        DeliveryLog::query()->updateOrCreate(
            ['twilio_sid' => $twilioMessage->sid],
            [
                'campaign_id' => $campaign->id,
                'twilio_number_id' => $fromNumber->id,
                'recipient_number' => $number,
                'message_body' => $this->body,
                'carrier_status' => $twilioMessage->status ?? 'queued',
                'error_code' => $twilioMessage->errorCode ? (string) $twilioMessage->errorCode : null,
                'is_blacklisted' => false,
            ]
        );

        $contact = Contact::query()->firstOrCreate(
            ['phone_number' => $number],
            [
                'name' => $number,
                'lead_status' => 'lead',
                'tags' => [],
                'last_twilio_number_id' => $fromNumber->id,
            ]
        );

        // Do not overwrite an existing Live Chat sticky line with the campaign sender.

        Message::query()->updateOrCreate(
            ['twilio_message_sid' => $twilioMessage->sid],
            [
                'contact_id' => $contact->id,
                'twilio_number_id' => $fromNumber->id,
                'from_number' => $fromNumber->phone_number,
                'to_number' => $number,
                'sent_by' => $this->sentByUserId,
                'direction' => 'outbound',
                'body' => $this->body,
                'status' => $twilioMessage->status ?? 'queued',
            ]
        );
    }
}
