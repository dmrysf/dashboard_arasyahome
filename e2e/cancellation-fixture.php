<?php
declare(strict_types=1);
// Frontend-only synthetic scenario for the cancellation control (API 2.35.0): one order cancelled at its source and
// reactivated again (stopped, awaiting a release) and one active order for a local stop. Disposable E2E database only.
use Arasya\Operations\Application\Container;
use Arasya\Operations\Database\Connection;
use Arasya\Operations\Tests\OperationsTestSupport as T;
require dirname(__DIR__) . '/operations-api/bootstrap.php';
require dirname(__DIR__) . '/operations-api/tests/OperationsTestSupport.php';
$dbName = (string) getenv('ARASYA_E2E_DB_NAME');
if (preg_match('/^[a-z0-9_]*e2e[a-z0-9_]*test[a-z0-9_]*$|^[a-z0-9_]*test[a-z0-9_]*e2e[a-z0-9_]*$/D', $dbName) !== 1) throw new RuntimeException('Dedicated E2E test database required.');
$config = T::config($dbName, ['http://127.0.0.1:4174', 'http://127.0.0.1:4175', T::ORIGIN]);
$pdo = Connection::create($config);
$kernel = (new Container($config, $pdo))->kernel();
$lines = static fn (int $base): array => [['id' => $base, 'line' => 1, 'name' => 'DRAPERIE TEST', 'sku' => 'D-CX', 'color' => 'Gri', 'width' => 250, 'height' => 260, 'unit' => 'cm', 'meters' => 5, 'quantity' => 1]];
$ingest = static function (string $number, string $event, int $minutesAgo, ?string $stage, string $availability, int $base) use ($kernel, $lines): array {
    $r = T::ingest($kernel, 'trendhome', T::sourceOrder($number, $event, gmdate('Y-m-d\TH:i:s\Z', time() - $minutesAgo * 60), $stage === null ? null : T::stage($stage), $availability === 'cancelled' ? 'cancelled' : 'processing', $availability, $lines($base), $number));
    if (!in_array($r['body']['outcome'] ?? null, ['applied'], true)) throw new RuntimeException('Synthetic ingestion failed: ' . json_encode($r));
    return $r['body'];
};
$stopped = '79035' . (string) random_int(1000, 9999);
$created = $ingest($stopped, "cx-{$stopped}-1", 30, 'labeling', 'active', 790350001);
$ingest($stopped, "cx-{$stopped}-2", 20, null, 'cancelled', 790350001);
$ingest($stopped, "cx-{$stopped}-3", 10, null, 'active', 790350001);
$local = '79036' . (string) random_int(1000, 9999);
$ingest($local, "cx-{$local}-1", 30, 'ironing', 'active', 790360001);
echo json_encode(['stopped' => ['order' => "trendhome:{$stopped}", 'number' => $stopped, 'qr' => $created['qr']], 'local' => ['order' => "trendhome:{$local}", 'number' => $local]], JSON_THROW_ON_ERROR), "\n";
