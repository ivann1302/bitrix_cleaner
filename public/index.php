<?php

declare(strict_types=1);

$indexPath = __DIR__ . '/index.html';

if (!is_file($indexPath)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'CRM Cleaner build is incomplete.';
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
readfile($indexPath);
