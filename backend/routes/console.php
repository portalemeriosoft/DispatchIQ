<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
| Shared hosting (Namecheap Stellar) has no long-running queue worker.
| Cron runs `php artisan schedule:run` every minute; this drains the
| database queue without blocking past ~50s (fits typical cron windows).
*/
Schedule::command('queue:work --stop-when-empty --max-time=50 --tries=1')
    ->everyMinute()
    ->withoutOverlapping(5);
