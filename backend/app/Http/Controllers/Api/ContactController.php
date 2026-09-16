<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Services\Twilio\MessagingService;
use App\Support\AgentScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ContactController extends Controller
{
    public function __construct(
        private readonly MessagingService $messaging,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'lead_status' => ['sometimes', 'nullable', Rule::in(['lead', 'customer'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $numberRelation = 'lastTwilioNumber:id,phone_number,friendly_name';

        $query = AgentScope::contacts($request->user())
            ->with(['assignee:id,name,email', $numberRelation])
            ->latest();

        if ($request->boolean('inbox')) {
            $query = AgentScope::contacts($request->user())
                ->with([
                    'assignee:id,name,email',
                    $numberRelation,
                    'latestMessage.twilioNumber:id,phone_number,friendly_name',
                ])
                ->orderByRaw('(select max(created_at) from messages where messages.contact_id = contacts.id) is null')
                ->orderByRaw('(select max(created_at) from messages where messages.contact_id = contacts.id) desc')
                ->orderByDesc('updated_at');
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $like = '%'.$search.'%';
                $q->where('name', 'like', $like)
                    ->orWhere('phone_number', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('tags', 'like', $like);
            });
        }

        if ($status = $request->query('lead_status')) {
            $query->where('lead_status', $status);
        }

        $perPage = (int) $request->query('per_page', 15);

        return response()->json(
            $query->paginate($perPage)->withQueryString()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedContact($request);

        // Bind new contacts to a line the creator can use (required for agent visibility).
        // Admins may leave sticky unset when creating CRM-only contacts.
        if ($request->user()?->role === 'admin' && empty($data['twilio_number_id'])) {
            unset($data['twilio_number_id']);
        } else {
            try {
                $line = $this->messaging->resolveSendNumber(
                    $request->user(),
                    isset($data['twilio_number_id']) ? (int) $data['twilio_number_id'] : null,
                );
                $data['last_twilio_number_id'] = $line->id;
            } catch (\InvalidArgumentException $e) {
                throw ValidationException::withMessages([
                    'twilio_number_id' => [$e->getMessage()],
                ]);
            }
            unset($data['twilio_number_id']);
        }

        $contact = Contact::query()->create($data);
        $contact->load(['assignee:id,name,email', 'lastTwilioNumber:id,phone_number,friendly_name']);

        return response()->json($contact, 201);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        if (! AgentScope::canAccessContact($request->user(), $contact)) {
            abort(403, 'You do not have access to this contact.');
        }

        $data = $this->validatedContact($request, $contact->id);
        unset($data['twilio_number_id']);
        $contact->update($data);
        $contact->load(['assignee:id,name,email', 'lastTwilioNumber:id,phone_number,friendly_name']);

        return response()->json($contact);
    }

    public function destroy(Request $request, Contact $contact): JsonResponse
    {
        if (! AgentScope::canAccessContact($request->user(), $contact)) {
            abort(403, 'You do not have access to this contact.');
        }

        $contact->delete();

        return response()->json(['message' => 'Contact deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedContact(Request $request, ?int $contactId = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone_number' => [
                'required',
                'string',
                'regex:/^\+[1-9]\d{1,14}$/',
                Rule::unique('contacts', 'phone_number')->ignore($contactId),
            ],
            'email' => ['nullable', 'email', 'max:255'],
            'lead_status' => ['required', Rule::in(['lead', 'customer'])],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:50'],
            'internal_notes' => ['nullable', 'string'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'twilio_number_id' => ['nullable', 'integer', 'exists:twilio_numbers,id'],
        ], [
            'phone_number.regex' => 'Phone number must be in E.164 format (e.g. +923001234567).',
            'phone_number.unique' => 'A contact with this phone number already exists.',
        ]);

        if (array_key_exists('tags', $data) && is_array($data['tags'])) {
            $data['tags'] = array_values(array_filter(array_map(
                fn ($tag) => trim(ltrim((string) $tag, '#')),
                $data['tags']
            )));
        }

        return $data;
    }
}
