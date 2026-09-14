<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QuickReply;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuickReplyController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            QuickReply::query()->orderBy('shortcut')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'shortcut' => ['required', 'string', 'max:50', 'unique:quick_replies,shortcut'],
            'body' => ['required', 'string'],
        ]);

        $data['shortcut'] = ltrim($data['shortcut'], '/');

        $reply = QuickReply::query()->create($data);

        return response()->json($reply, 201);
    }

    public function destroy(QuickReply $quickReply): JsonResponse
    {
        $quickReply->delete();

        return response()->json(['message' => 'Quick reply deleted.']);
    }
}
