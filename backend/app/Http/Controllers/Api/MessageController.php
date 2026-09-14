<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Blacklist;
use App\Models\Contact;
use App\Models\DeliveryLog;
use App\Models\Message;
use App\Services\Twilio\MessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Twilio\Exceptions\RestException;

class MessageController extends Controller
{
    public function __construct(
        private readonly MessagingService $messaging,
    ) {}

    public function index(Request $request, Contact $contact): JsonResponse
    {
        $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $messages = Message::query()
            ->where('contact_id', $contact->id)
            ->with('sender:id,name,email,agent_code')
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate((int) $request->query('per_page', 50));

        return response()->json($messages);
    }

    public function store(Request $request, Contact $contact): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:1600'],
        ]);

        if (Blacklist::query()->where('phone_number', $contact->phone_number)->exists()) {
            throw ValidationException::withMessages([
                'body' => ['This number is blacklisted / opted out. Message not sent.'],
            ]);
        }

        try {
            $twilioMessage = $this->messaging->sendSms($contact->phone_number, $data['body']);
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'twilio' => [$e->getMessage()],
            ]);
        } catch (RestException $e) {
            throw ValidationException::withMessages([
                'twilio' => ['Twilio send failed: '.$e->getMessage()],
            ]);
        }

        $message = Message::query()->create([
            'contact_id' => $contact->id,
            'sent_by' => $request->user()->id,
            'direction' => 'outbound',
            'body' => $data['body'],
            'twilio_message_sid' => $twilioMessage->sid,
            'status' => $twilioMessage->status ?? 'queued',
        ]);

        DeliveryLog::query()->create([
            'campaign_id' => null,
            'recipient_number' => $contact->phone_number,
            'message_body' => $data['body'],
            'twilio_sid' => $twilioMessage->sid,
            'carrier_status' => $twilioMessage->status ?? 'queued',
            'error_code' => $twilioMessage->errorCode ? (string) $twilioMessage->errorCode : null,
            'is_blacklisted' => false,
        ]);

        $message->load('sender:id,name,email,agent_code');

        return response()->json($message, 201);
    }
}
