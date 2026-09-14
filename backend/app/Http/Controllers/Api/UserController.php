<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);

        $users = User::query()
            ->orderBy('agent_code')
            ->get(['id', 'name', 'email', 'role', 'is_master', 'agent_code', 'created_at', 'updated_at']);

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['sometimes', Rule::in(['admin', 'agent'])],
        ]);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => $data['role'] ?? 'agent',
        ]);

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'is_master' => (bool) $user->is_master,
            'agent_code' => $user->agent_code,
            'agent_label' => $user->agent_label,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->ensureAdmin($request);
        $this->ensureNotMaster($user);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:8'],
            'role' => ['required', Rule::in(['admin', 'agent'])],
        ]);

        // Email is immutable — never accept it from the request.
        if (
            $user->role === 'admin'
            && $data['role'] !== 'admin'
        ) {
            $adminCount = User::query()->where('role', 'admin')->count();
            if ($adminCount <= 1) {
                throw ValidationException::withMessages([
                    'role' => ['Cannot demote the last admin account.'],
                ]);
            }
        }

        $user->name = $data['name'];
        $user->role = $data['role'];

        if (filled($data['password'] ?? null)) {
            $user->password = $data['password'];
        }

        $user->save();

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'is_master' => (bool) $user->is_master,
            'agent_code' => $user->agent_code,
            'agent_label' => $user->agent_label,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->ensureAdmin($request);
        $this->ensureNotMaster($user);

        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages([
                'user' => ['You cannot remove your own account.'],
            ]);
        }

        if ($user->role === 'admin') {
            $adminCount = User::query()->where('role', 'admin')->count();
            if ($adminCount <= 1) {
                throw ValidationException::withMessages([
                    'user' => ['Cannot remove the last admin account.'],
                ]);
            }
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'User removed.']);
    }

    private function ensureAdmin(Request $request): void
    {
        if ($request->user()?->role !== 'admin') {
            abort(403, 'Only admins can manage team accounts.');
        }
    }

    private function ensureNotMaster(User $user): void
    {
        if ($user->is_master) {
            throw ValidationException::withMessages([
                'user' => ['The master admin account cannot be edited or removed.'],
            ]);
        }
    }
}
