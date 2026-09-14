<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
    ];

    /**
     * @var list<string>
     */
    protected $appends = [
        'agent_label',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected static function booted(): void
    {
        static::creating(function (User $user): void {
            // Permanent staff ID — auto-assigned, never taken from request input.
            if (! $user->agent_code) {
                $next = (int) static::query()->max('agent_code');
                $user->agent_code = $next + 1;
            }
        });

        static::updating(function (User $user): void {
            if ($user->isDirty('agent_code')) {
                $user->agent_code = $user->getOriginal('agent_code');
            }
            if ($user->isDirty('is_master')) {
                $user->is_master = (bool) $user->getOriginal('is_master');
            }
        });
    }

    /**
     * Zero-padded display id: 01, 02, 10...
     */
    public function getAgentLabelAttribute(): string
    {
        $code = (int) ($this->agent_code ?? 0);

        return $code > 0 ? str_pad((string) $code, 2, '0', STR_PAD_LEFT) : '—';
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_master' => 'boolean',
        ];
    }

    public function assignedContacts(): HasMany
    {
        return $this->hasMany(Contact::class, 'assigned_to');
    }

    public function sentMessages(): HasMany
    {
        return $this->hasMany(Message::class, 'sent_by');
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(Campaign::class, 'created_by');
    }
}
