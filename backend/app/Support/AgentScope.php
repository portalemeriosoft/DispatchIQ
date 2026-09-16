<?php

namespace App\Support;

use App\Models\Contact;
use App\Models\DeliveryLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class AgentScope
{
    /**
     * Assigned Twilio number IDs for an agent.
     * Null means unrestricted (admin). Empty array means no access.
     *
     * @return list<int>|null
     */
    public static function numberIds(?User $user): ?array
    {
        if (! $user) {
            return [];
        }

        if ($user->role === 'admin') {
            return null;
        }

        return $user->twilioNumbers()
            ->where('twilio_numbers.is_active', true)
            ->pluck('twilio_numbers.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Admins see everything. Agents only see delivery logs for their assigned numbers.
     */
    public static function deliveryLogs(?User $user): Builder
    {
        $query = DeliveryLog::query();
        $ids = self::numberIds($user);

        if ($ids === null) {
            return $query;
        }

        if ($ids === []) {
            return $query->whereRaw('0 = 1');
        }

        return $query->whereIn('twilio_number_id', $ids);
    }

    /**
     * Admins see all contacts. Agents only see contacts on their assigned lines
     * (sticky line or any message on an assigned number).
     */
    public static function contacts(?User $user): Builder
    {
        $query = Contact::query();
        $ids = self::numberIds($user);

        if ($ids === null) {
            return $query;
        }

        if ($ids === []) {
            return $query->whereRaw('0 = 1');
        }

        return $query->where(function (Builder $q) use ($ids) {
            $q->whereIn('last_twilio_number_id', $ids)
                ->orWhereHas('messages', function (Builder $messages) use ($ids) {
                    $messages->whereIn('twilio_number_id', $ids);
                });
        });
    }

    public static function canAccessContact(?User $user, Contact $contact): bool
    {
        $ids = self::numberIds($user);

        if ($ids === null) {
            return true;
        }

        if ($ids === []) {
            return false;
        }

        if ($contact->last_twilio_number_id
            && in_array((int) $contact->last_twilio_number_id, $ids, true)) {
            return true;
        }

        return $contact->messages()
            ->whereIn('twilio_number_id', $ids)
            ->exists();
    }
}
