<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    public const UPDATED_AT = null;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'contact_id',
        'twilio_number_id',
        'from_number',
        'to_number',
        'sent_by',
        'direction',
        'body',
        'twilio_message_sid',
        'status',
    ];

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function twilioNumber(): BelongsTo
    {
        return $this->belongsTo(TwilioNumber::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }
}
