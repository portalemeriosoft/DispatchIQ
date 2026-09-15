<?php

use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CampaignController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DeliveryLogController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\QuickReplyController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\TwilioWebhookController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

Route::post('/webhooks/twilio/sms', TwilioWebhookController::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::middleware('admin')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{user}', [UserController::class, 'update']);
        Route::delete('/users/{user}', [UserController::class, 'destroy']);

        Route::put('/settings', [SettingsController::class, 'update']);
        Route::delete('/logs', [DeliveryLogController::class, 'destroyAll']);
    });

    Route::get('/contacts', [ContactController::class, 'index']);
    Route::post('/contacts', [ContactController::class, 'store']);
    Route::put('/contacts/{contact}', [ContactController::class, 'update']);
    Route::delete('/contacts/{contact}', [ContactController::class, 'destroy']);

    Route::get('/contacts/{contact}/messages', [MessageController::class, 'index']);
    Route::post('/contacts/{contact}/messages', [MessageController::class, 'store']);

    Route::get('/campaigns', [CampaignController::class, 'index']);
    Route::post('/campaigns', [CampaignController::class, 'store']);
    Route::get('/campaigns/{campaign}', [CampaignController::class, 'show']);

    Route::get('/settings', [SettingsController::class, 'show']);

    Route::get('/logs', [DeliveryLogController::class, 'index']);
    Route::delete('/logs/{log}', [DeliveryLogController::class, 'destroy']);
    Route::post('/logs/{log}/blacklist', [DeliveryLogController::class, 'blacklist']);
    Route::post('/logs/{log}/unblacklist', [DeliveryLogController::class, 'unblacklist']);

    Route::get('/analytics/summary', [AnalyticsController::class, 'summary']);
    Route::get('/analytics/trend', [AnalyticsController::class, 'trend']);

    Route::get('/quick-replies', [QuickReplyController::class, 'index']);
    Route::post('/quick-replies', [QuickReplyController::class, 'store']);
    Route::delete('/quick-replies/{quickReply}', [QuickReplyController::class, 'destroy']);
});
