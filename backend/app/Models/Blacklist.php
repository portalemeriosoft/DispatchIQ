<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Blacklist extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'blacklist';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'phone_number',
        'reason',
    ];
}
