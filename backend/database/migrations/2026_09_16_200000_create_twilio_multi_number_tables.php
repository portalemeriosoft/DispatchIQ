<?php

use App\Models\TwilioAccount;
use App\Models\TwilioNumber;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('twilio_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('label')->nullable();
            $table->text('account_sid');
            $table->text('auth_token');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('twilio_numbers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('twilio_account_id')->constrained('twilio_accounts')->cascadeOnDelete();
            $table->string('phone_number')->unique();
            $table->string('friendly_name')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('webhook_configured_at')->nullable();
            $table->timestamps();
        });

        Schema::create('twilio_number_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('twilio_number_id')->constrained('twilio_numbers')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['twilio_number_id', 'user_id']);
        });

        // Sticky line may be null until first inbound/outbound on that contact.
        Schema::table('contacts', function (Blueprint $table) {
            $table->foreignId('last_twilio_number_id')
                ->nullable()
                ->after('assigned_to')
                ->constrained('twilio_numbers')
                ->nullOnDelete();
        });

        // Fresh installs always attribute messages/logs/campaigns to a concrete line.
        Schema::table('messages', function (Blueprint $table) {
            $table->foreignId('twilio_number_id')
                ->after('contact_id')
                ->constrained('twilio_numbers')
                ->restrictOnDelete();
            $table->string('from_number')->nullable()->after('twilio_number_id');
            $table->string('to_number')->nullable()->after('from_number');
        });

        Schema::table('delivery_logs', function (Blueprint $table) {
            $table->foreignId('twilio_number_id')
                ->after('campaign_id')
                ->constrained('twilio_numbers')
                ->restrictOnDelete();
        });

        Schema::table('campaigns', function (Blueprint $table) {
            $table->foreignId('twilio_number_id')
                ->after('created_by')
                ->constrained('twilio_numbers')
                ->restrictOnDelete();
        });

        // Prevent duplicate delivery/message rows under concurrent status callbacks.
        Schema::table('delivery_logs', function (Blueprint $table) {
            $table->dropIndex(['twilio_sid']);
            $table->unique('twilio_sid');
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['twilio_message_sid']);
            $table->unique('twilio_message_sid');
        });

        // Optional local/dev carry-over from pre-multi-number settings row (no historical backfill).
        $legacy = DB::table('settings')->orderBy('id')->first();
        if ($legacy && ! empty($legacy->twilio_account_sid) && ! empty($legacy->sender_number)) {
            $account = TwilioAccount::query()->create([
                'label' => 'Primary',
                'account_sid' => $this->maybeDecrypt((string) $legacy->twilio_account_sid),
                'auth_token' => $this->maybeDecrypt((string) ($legacy->twilio_auth_token ?? '')),
                'is_active' => true,
            ]);

            TwilioNumber::query()->create([
                'twilio_account_id' => $account->id,
                'phone_number' => $legacy->sender_number,
                'friendly_name' => $legacy->sender_number,
                'is_active' => true,
            ]);
        }

        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn(['twilio_account_sid', 'twilio_auth_token', 'sender_number']);
        });
    }

    private function maybeDecrypt(string $value): string
    {
        if ($value === '') {
            return $value;
        }

        try {
            return Crypt::decryptString($value);
        } catch (\Throwable) {
            return $value;
        }
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->text('twilio_account_sid')->nullable();
            $table->text('twilio_auth_token')->nullable();
            $table->string('sender_number')->nullable();
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->dropUnique(['twilio_message_sid']);
            $table->index('twilio_message_sid');
        });

        Schema::table('delivery_logs', function (Blueprint $table) {
            $table->dropUnique(['twilio_sid']);
            $table->index('twilio_sid');
        });

        Schema::table('campaigns', function (Blueprint $table) {
            $table->dropConstrainedForeignId('twilio_number_id');
        });
        Schema::table('delivery_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('twilio_number_id');
        });
        Schema::table('messages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('twilio_number_id');
            $table->dropColumn(['from_number', 'to_number']);
        });
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('last_twilio_number_id');
        });

        Schema::dropIfExists('twilio_number_user');
        Schema::dropIfExists('twilio_numbers');
        Schema::dropIfExists('twilio_accounts');
    }
};
