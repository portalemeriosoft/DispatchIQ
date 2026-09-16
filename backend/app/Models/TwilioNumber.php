<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TwilioNumber extends Model
{
    protected $fillable = [
        'twilio_account_id',
        'phone_number',
        'friendly_name',
        'is_active',
        'webhook_configured_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'webhook_configured_at' => 'datetime',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(TwilioAccount::class, 'twilio_account_id');
    }

    public function agents(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'twilio_number_user')->withTimestamps();
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class, 'last_twilio_number_id');
    }

    public function displayLabel(): string
    {
        $name = trim((string) $this->friendly_name);

        return $name !== '' ? $name : $this->phone_number;
    }
}
