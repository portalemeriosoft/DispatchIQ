<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Blacklist;
use App\Models\DeliveryLog;
use App\Support\AgentScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeliveryLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'nullable', 'string', 'max:50'],
            'twilio_number_id' => ['sometimes', 'nullable', 'integer'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $query = AgentScope::deliveryLogs($request->user())
            ->with('twilioNumber:id,phone_number,friendly_name')
            ->latest('created_at')
            ->latest('id');

        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->where('recipient_number', 'like', $like)
                    ->orWhere('message_body', 'like', $like)
                    ->orWhere('twilio_sid', 'like', $like)
                    ->orWhere('error_code', 'like', $like);
            });
        }

        if ($status = trim((string) $request->query('status', ''))) {
            $this->applyStatusFilter($query, $status);
        }

        if ($numberId = $request->query('twilio_number_id')) {
            $allowed = AgentScope::numberIds($request->user());
            $numberId = (int) $numberId;
            if ($allowed === null || in_array($numberId, $allowed, true)) {
                $query->where('twilio_number_id', $numberId);
            }
        }

        return response()->json(
            $query->paginate((int) $request->query('per_page', 25))->withQueryString()
        );
    }

    public function destroy(Request $request, DeliveryLog $log): JsonResponse
    {
        $this->authorizeLogAccess($request, $log);
        $log->delete();

        return response()->json(['message' => 'Log deleted.']);
    }

    public function destroyAll(): JsonResponse
    {
        $deleted = DeliveryLog::query()->delete();

        return response()->json([
            'message' => 'All delivery logs cleared.',
            'deleted' => $deleted,
        ]);
    }

    public function blacklist(Request $request, DeliveryLog $log): JsonResponse
    {
        $this->authorizeLogAccess($request, $log);

        Blacklist::query()->firstOrCreate(
            ['phone_number' => $log->recipient_number],
            ['reason' => 'Manually locked from Master Logs']
        );

        DeliveryLog::query()
            ->where('recipient_number', $log->recipient_number)
            ->update([
                'is_blacklisted' => true,
                'carrier_status' => 'blacklisted',
            ]);

        return response()->json([
            'message' => 'Number locked / blacklisted.',
            'log' => $log->fresh('twilioNumber:id,phone_number,friendly_name'),
        ]);
    }

    public function unblacklist(Request $request, DeliveryLog $log): JsonResponse
    {
        $this->authorizeLogAccess($request, $log);

        Blacklist::query()
            ->where('phone_number', $log->recipient_number)
            ->delete();

        DeliveryLog::query()
            ->where('recipient_number', $log->recipient_number)
            ->update(['is_blacklisted' => false]);

        if ($log->fresh()?->carrier_status === 'blacklisted') {
            $log->update(['carrier_status' => 'unlocked']);
        }

        return response()->json([
            'message' => 'Number unlocked.',
            'log' => $log->fresh('twilioNumber:id,phone_number,friendly_name'),
        ]);
    }

    private function authorizeLogAccess(Request $request, DeliveryLog $log): void
    {
        if ($request->user()?->role === 'admin') {
            return;
        }

        $allowed = AgentScope::deliveryLogs($request->user())
            ->where('delivery_logs.id', $log->id)
            ->exists();

        if (! $allowed) {
            abort(403, 'You can only manage your own delivery logs.');
        }
    }

    private function applyStatusFilter($query, string $status): void
    {
        $normalized = strtolower($status);

        match ($normalized) {
            'delivered' => $query->where('carrier_status', 'delivered'),
            'sent', 'pending', 'sent_pending' => $query->whereIn('carrier_status', [
                'queued', 'accepted', 'sending', 'sent', 'scheduled', 'pending',
            ]),
            'failed', 'invalid', 'failed_invalid' => $query->where(function ($q) {
                $q->whereIn('carrier_status', ['failed', 'undelivered', 'canceled', 'cancelled'])
                    ->orWhereNotNull('error_code');
            })->where('is_blacklisted', false),
            'blacklisted', 'locked' => $query->where(function ($q) {
                $q->where('is_blacklisted', true)
                    ->orWhere('carrier_status', 'blacklisted');
            }),
            default => $query->where('carrier_status', $status),
        };
    }
}
