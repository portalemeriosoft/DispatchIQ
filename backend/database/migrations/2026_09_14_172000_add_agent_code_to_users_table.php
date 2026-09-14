<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('agent_code')->nullable()->unique()->after('role');
        });

        $users = DB::table('users')->orderBy('id')->get(['id']);
        $code = 1;
        foreach ($users as $user) {
            DB::table('users')->where('id', $user->id)->update(['agent_code' => $code]);
            $code++;
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['agent_code']);
            $table->dropColumn('agent_code');
        });
    }
};
