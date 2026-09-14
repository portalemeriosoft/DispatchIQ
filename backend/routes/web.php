<?php

use Illuminate\Support\Facades\Route;

/*
| Same-origin SPA: Vite builds frontend into public/ (index.html + assets/).
| API lives under /api; existing files are served by the web server first.
*/
Route::get('/{any?}', function () {
    $spa = public_path('index.html');

    if (is_file($spa)) {
        return response()->file($spa);
    }

    return view('welcome');
})->where('any', '.*');
