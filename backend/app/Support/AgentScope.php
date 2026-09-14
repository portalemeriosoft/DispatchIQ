<?php

namespace App\Support;

use App\Models\DeliveryLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class AgentScope
{
    /**
     * Admins see everything. Agents only see delivery logs from their
     * campaigns or live-chat messages they sent.
     */
    public static function deliveryLogs(?User $user): Builder
    {
        $query = DeliveryLog::query();

        if (! $user || $user->role === 'admin') {
            return $query;
        }

        $userId = $user->id;

        return $query->where(function (Builder $q) use ($userId) {
            $q->whereHas('campaign', function (Builder $campaign) use ($userId) {
                $campaign->where('created_by', $userId);
            })->orWhereIn('twilio_sid', function ($sub) use ($userId) {
                $sub->select('twilio_message_sid')
                    ->from('messages')
                    ->where('sent_by', $userId)
                    ->whereNotNull('twilio_message_sid');
            });
        });
    }
}
