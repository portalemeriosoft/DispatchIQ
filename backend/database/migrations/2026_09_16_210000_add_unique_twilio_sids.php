<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hardening for environments that already ran the earlier multi-number migration.
 * Fresh installs already get unique SIDs from 2026_09_16_200000.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->ensureUnique('delivery_logs', 'twilio_sid', 'delivery_logs_twilio_sid_unique');
        $this->ensureUnique('messages', 'twilio_message_sid', 'messages_twilio_message_sid_unique');
    }

    public function down(): void
    {
        Schema::table('delivery_logs', function (Blueprint $table) {
            try {
                $table->dropUnique(['twilio_sid']);
            } catch (\Throwable) {
                //
            }
            $table->index('twilio_sid');
        });

        Schema::table('messages', function (Blueprint $table) {
            try {
                $table->dropUnique(['twilio_message_sid']);
            } catch (\Throwable) {
                //
            }
            $table->index('twilio_message_sid');
        });
    }

    private function ensureUnique(string $table, string $column, string $indexName): void
    {
        $connection = Schema::getConnection();
        $database = $connection->getDatabaseName();

        $exists = $connection->selectOne(
            'SELECT COUNT(*) AS c FROM information_schema.statistics
             WHERE table_schema = ? AND table_name = ? AND index_name = ?',
            [$database, $table, $indexName]
        );

        if ((int) ($exists->c ?? 0) > 0) {
            return;
        }

        $nonUnique = $table.'_'.$column.'_index';
        $hasNonUnique = $connection->selectOne(
            'SELECT COUNT(*) AS c FROM information_schema.statistics
             WHERE table_schema = ? AND table_name = ? AND index_name = ?',
            [$database, $table, $nonUnique]
        );

        Schema::table($table, function (Blueprint $blueprint) use ($column, $hasNonUnique, $nonUnique) {
            if ((int) ($hasNonUnique->c ?? 0) > 0) {
                $blueprint->dropIndex($nonUnique);
            }
            $blueprint->unique($column);
        });
    }
};
