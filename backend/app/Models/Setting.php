<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    public const CREATED_AT = null;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'provider',
        'twilio_account_sid',
        'twilio_auth_token',
        'sender_number',
        'default_country_code',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'twilio_account_sid',
        'twilio_auth_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'twilio_account_sid' => 'encrypted',
            'twilio_auth_token' => 'encrypted',
        ];
    }
}
