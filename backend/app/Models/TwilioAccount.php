<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TwilioAccount extends Model
{
    protected $fillable = [
        'label',
        'account_sid',
        'auth_token',
        'is_active',
    ];

    protected $hidden = [
        'account_sid',
        'auth_token',
    ];

    protected function casts(): array
    {
        return [
            'account_sid' => 'encrypted',
            'auth_token' => 'encrypted',
            'is_active' => 'boolean',
        ];
    }

    public function numbers(): HasMany
    {
        return $this->hasMany(TwilioNumber::class);
    }
}
