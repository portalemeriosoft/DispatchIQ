<?php

namespace App\Services;

class PhoneNumberNormalizer
{
    /**
     * Normalize a raw phone value to E.164 using the default region prefix
     * when the number is missing an international country code.
     */
    public function normalize(string $raw, string $defaultCountryCode): ?string
    {
        $trimmed = trim($raw);
        if ($trimmed === '') {
            return null;
        }

        // Keep leading +, strip other non-digits.
        $hasPlus = str_starts_with($trimmed, '+');
        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if ($digits === '') {
            return null;
        }

        $prefix = $this->normalizePrefix($defaultCountryCode);

        if ($hasPlus) {
            return '+'.$digits;
        }

        // Local number starting with 0 (e.g. 0412...) → drop trunk 0, prepend region.
        if (str_starts_with($digits, '0') && $prefix !== '') {
            return $prefix.substr($digits, 1);
        }

        // Already includes country digits without + (e.g. 61412345678)
        if ($prefix !== '' && str_starts_with($digits, ltrim($prefix, '+'))) {
            return '+'.$digits;
        }

        if ($prefix !== '') {
            return $prefix.$digits;
        }

        return '+'.$digits;
    }

    /**
     * @param  iterable<int, string>  $rawNumbers
     * @return list<string>
     */
    public function normalizeMany(iterable $rawNumbers, string $defaultCountryCode): array
    {
        $normalized = [];

        foreach ($rawNumbers as $raw) {
            $value = $this->normalize((string) $raw, $defaultCountryCode);
            if ($value !== null) {
                $normalized[] = $value;
            }
        }

        return array_values(array_unique($normalized));
    }

    public function normalizePrefix(string $defaultCountryCode): string
    {
        $prefix = trim($defaultCountryCode);
        if ($prefix === '') {
            return '';
        }

        if (! str_starts_with($prefix, '+')) {
            $prefix = '+'.ltrim($prefix, '+');
        }

        return $prefix;
    }
}
