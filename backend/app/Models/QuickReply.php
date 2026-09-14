<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QuickReply extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'shortcut',
        'body',
    ];
}
