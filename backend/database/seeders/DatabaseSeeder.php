<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $admin = User::query()->firstOrNew(['email' => 'admin@dispatchiq.com']);

        $admin->name = 'Admin';
        $admin->password = 'Click@321';
        $admin->role = 'admin';
        $admin->is_master = true;
        if (! $admin->agent_code) {
            $admin->agent_code = 1;
        }
        $admin->save();
    }
}
