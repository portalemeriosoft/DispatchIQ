<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\AgentScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        $base = AgentScope::deliveryLogs($request->user());

        $totalSent = (clone $base)->count();

        $delivered = (clone $base)
            ->where('carrier_status', 'delivered')
            ->where('is_blacklisted', false)
            ->count();

        $spamFiltered = (clone $base)
            ->where(function ($q) {
                $q->where('error_code', '30007')
                    ->orWhere('carrier_status', 'like', '%spam%');
            })
            ->count();

        $failedInvalid = (clone $base)
            ->where('is_blacklisted', false)
            ->where(function ($q) {
                $q->whereIn('carrier_status', ['failed', 'undelivered', 'canceled', 'cancelled'])
                    ->orWhere('error_code', '21614')
                    ->orWhere(function ($inner) {
                        $inner->whereNotNull('error_code')
                            ->where('error_code', '!=', '30007')
                            ->where('error_code', '!=', 'opt_out');
                    });
            })
            ->where(function ($q) {
                $q->whereNull('error_code')
                    ->orWhere('error_code', '!=', '30007');
            })
            ->count();

        $lockedOptedOut = (clone $base)
            ->where(function ($q) {
                $q->where('is_blacklisted', true)
                    ->orWhere('carrier_status', 'blacklisted')
                    ->orWhere('error_code', 'opt_out');
            })
            ->count();

        $ratio = [
            'delivered' => $delivered,
            'sent_pending' => (clone $base)->whereIn('carrier_status', [
                'queued', 'accepted', 'sending', 'sent', 'scheduled', 'pending',
            ])->where('is_blacklisted', false)->count(),
            'spam_filtered' => $spamFiltered,
            'failed_invalid' => $failedInvalid,
            'locked_opted_out' => $lockedOptedOut,
        ];

        return response()->json([
            'total_sent' => $totalSent,
            'delivered' => $delivered,
            'spam_filtered' => $spamFiltered,
            'failed_invalid' => $failedInvalid,
            'locked_opted_out' => $lockedOptedOut,
            'ratio' => $ratio,
            'scoped' => $request->user()?->role !== 'admin',
        ]);
    }

    public function trend(Request $request): JsonResponse
    {
        $request->validate([
            'days' => ['sometimes', 'integer', 'min:1', 'max:90'],
        ]);

        $days = (int) $request->query('days', 14);
        $start = Carbon::now()->subDays($days - 1)->startOfDay();

        $rows = AgentScope::deliveryLogs($request->user())
            ->selectRaw('DATE(created_at) as day')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN carrier_status = 'delivered' AND is_blacklisted = 0 THEN 1 ELSE 0 END) as delivered")
            ->selectRaw("SUM(CASE WHEN is_blacklisted = 1 OR carrier_status = 'blacklisted' OR error_code = 'opt_out' THEN 1 ELSE 0 END) as locked")
            ->selectRaw("SUM(CASE WHEN error_code = '30007' THEN 1 ELSE 0 END) as spam")
            ->selectRaw("SUM(CASE WHEN (carrier_status IN ('failed','undelivered','canceled','cancelled') OR error_code = '21614') AND is_blacklisted = 0 AND (error_code IS NULL OR error_code != '30007') THEN 1 ELSE 0 END) as failed")
            ->selectRaw("SUM(CASE WHEN carrier_status IN ('queued','accepted','sending','sent','scheduled','pending') AND is_blacklisted = 0 THEN 1 ELSE 0 END) as pending")
            ->where('created_at', '>=', $start)
            ->groupBy(DB::raw('DATE(created_at)'))
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        $trend = [];
        for ($i = 0; $i < $days; $i++) {
            $day = $start->copy()->addDays($i)->toDateString();
            $row = $rows->get($day);

            $trend[] = [
                'date' => $day,
                'total' => (int) ($row->total ?? 0),
                'delivered' => (int) ($row->delivered ?? 0),
                'pending' => (int) ($row->pending ?? 0),
                'spam' => (int) ($row->spam ?? 0),
                'failed' => (int) ($row->failed ?? 0),
                'locked' => (int) ($row->locked ?? 0),
            ];
        }

        return response()->json([
            'days' => $days,
            'trend' => $trend,
            'scoped' => $request->user()?->role !== 'admin',
        ]);
    }
}
