<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Blacklist;
use App\Models\Contact;
use App\Models\DeliveryLog;
use App\Models\Message;
use App\Services\Twilio\MessagingService;
use App\Support\AgentScope;
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
        $this->authorizeContact($request, $contact);

        $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $messages = Message::query()
            ->where('contact_id', $contact->id)
            ->with(['sender:id,name,email,agent_code', 'twilioNumber:id,phone_number,friendly_name'])
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate((int) $request->query('per_page', 50));

        // Opening the thread marks inbound as read for all agents/admins.
        $contact->forceFill(['last_read_at' => now()])->save();

        return response()->json($messages);
    }

    public function store(Request $request, Contact $contact): JsonResponse
    {
        $this->authorizeContact($request, $contact);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:1600'],
            'twilio_number_id' => ['nullable', 'integer', 'exists:twilio_numbers,id'],
        ]);

        if (Blacklist::query()->where('phone_number', $contact->phone_number)->exists()) {
            throw ValidationException::withMessages([
                'body' => ['This number is blacklisted / opted out. Message not sent.'],
            ]);
        }

        $stickyId = $contact->last_twilio_number_id ? (int) $contact->last_twilio_number_id : null;
        $availableIds = $this->messaging->availableNumbersFor($request->user())->pluck('id')->map(fn ($id) => (int) $id);

        // Block sticky-line stealing: agent must own the conversation's line.
        if ($stickyId && ! $availableIds->contains($stickyId) && $request->user()?->role !== 'admin') {
            abort(403, 'This conversation belongs to a Twilio number you are not assigned to.');
        }

        try {
            $fromNumber = $this->messaging->resolveSendNumber(
                $request->user(),
                isset($data['twilio_number_id']) ? (int) $data['twilio_number_id'] : null,
                $stickyId,
            );

            $twilioMessage = $this->messaging->sendSms(
                $contact->phone_number,
                $data['body'],
                $fromNumber,
            );
        } catch (\InvalidArgumentException $e) {
            if (str_contains($e->getMessage(), 'not assigned')) {
                abort(403, $e->getMessage());
            }
            throw ValidationException::withMessages([
                'twilio' => [$e->getMessage()],
            ]);
        } catch (RestException $e) {
            throw ValidationException::withMessages([
                'twilio' => ['Twilio send failed: '.$e->getMessage()],
            ]);
        }

        // Only set sticky when missing; never overwrite another line mid-thread.
        if (! $contact->last_twilio_number_id) {
            $contact->update(['last_twilio_number_id' => $fromNumber->id]);
        }

        $message = Message::query()->updateOrCreate(
            ['twilio_message_sid' => $twilioMessage->sid],
            [
                'contact_id' => $contact->id,
                'twilio_number_id' => $fromNumber->id,
                'from_number' => $fromNumber->phone_number,
                'to_number' => $contact->phone_number,
                'sent_by' => $request->user()->id,
                'direction' => 'outbound',
                'body' => $data['body'],
                'status' => $twilioMessage->status ?? 'queued',
            ]
        );

        DeliveryLog::query()->updateOrCreate(
            ['twilio_sid' => $twilioMessage->sid],
            [
                'campaign_id' => null,
                'twilio_number_id' => $fromNumber->id,
                'recipient_number' => $contact->phone_number,
                'message_body' => $data['body'],
                'carrier_status' => $twilioMessage->status ?? 'queued',
                'error_code' => $twilioMessage->errorCode ? (string) $twilioMessage->errorCode : null,
                'is_blacklisted' => false,
            ]
        );

        $message->load(['sender:id,name,email,agent_code', 'twilioNumber:id,phone_number,friendly_name']);

        return response()->json($message, 201);
    }

    private function authorizeContact(Request $request, Contact $contact): void
    {
        if (! AgentScope::canAccessContact($request->user(), $contact)) {
            abort(403, 'You do not have access to this conversation.');
        }
    }
}
