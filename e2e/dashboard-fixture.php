<?php

declare(strict_types=1);

// Builds a disposable database for the Dashboard real-API Chromium suite using the real Operations
// API code checked out at ./operations-api (pinned in e2e/operations-api.ref), bootstraps the single
// protected root identity through the real CLI service, and prints the fixture as JSON. It refuses any
// database whose name does not contain both "e2e" and "test"; it never touches production.

use Arasya\Operations\Application\Container;
use Arasya\Operations\Database\Connection;
use Arasya\Operations\Database\MigrationRunner;
use Arasya\Operations\Database\SqlFileRunner;
use Arasya\Operations\Iam\RootBootstrapService;
use Arasya\Operations\Tests\OperationsTestSupport as T;

$api = dirname(__DIR__) . '/operations-api';
require $api . '/bootstrap.php';
require $api . '/tests/OperationsTestSupport.php';

$dbName = (string) getenv('ARASYA_E2E_DB_NAME');
if (preg_match('/^[a-z0-9_]*e2e[a-z0-9_]*test[a-z0-9_]*$|^[a-z0-9_]*test[a-z0-9_]*e2e[a-z0-9_]*$/D', $dbName) !== 1) {
    fwrite(STDERR, "ARASYA_E2E_DB_NAME must be a dedicated database whose name contains both 'e2e' and 'test'.\n");
    exit(2);
}
$host = (string) (getenv('ARASYA_TEST_DB_HOST') ?: '127.0.0.1');
$port = (int) (getenv('ARASYA_TEST_DB_PORT') ?: 3306);
$server = new PDO(sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $host, $port), (string) getenv('ARASYA_TEST_DB_USER'), (string) getenv('ARASYA_TEST_DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec("DROP DATABASE IF EXISTS `{$dbName}`");
$server->exec("CREATE DATABASE `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$origin = (string) (getenv('ARASYA_E2E_ORIGIN') ?: 'http://127.0.0.1:4175');
$config = T::config($dbName, array_values(array_unique([$origin, T::ORIGIN])));
$pdo = Connection::create($config);
(new MigrationRunner($pdo))->migrate($api . '/database/migrations');
$seeds = glob($api . '/database/seeds/*.sql') ?: [];
sort($seeds, SORT_STRING);
foreach ($seeds as $seed) {
    (new SqlFileRunner($pdo))->run($seed);
}

$container = new Container($config, $pdo);
$rootPassword = (new RootBootstrapService($pdo, $container->passwordHasher(), $container->clock()))->bootstrap('e2e-root-bootstrap');
$rootId = (string) $pdo->query('SELECT employee_uuid FROM system_root_identity')->fetchColumn();
$role = $pdo->query("SELECT role_id, name FROM roles WHERE role_key = 'employee'")->fetch();
$stage = $pdo->query("SELECT ps.stage_id, ps.display_name AS label FROM production_stages ps INNER JOIN production_workflows pw ON pw.workflow_id = ps.workflow_id WHERE ps.status = 'active' AND pw.status = 'active' ORDER BY ps.ordinal LIMIT 1")->fetch();
$department = $pdo->query("SELECT department_id, name FROM departments WHERE status = 'active' ORDER BY department_id LIMIT 1")->fetch();

// Real production data for the overview, written through the real signed ingestion and Staff operations.
$kernel = $container->kernel();
$changedAt = gmdate('Y-m-d\TH:i:s\Z', time() - 120);
foreach ([
    '60001' => ['trendhome', 'waiting', 'active'],
    '60002' => ['trendhome', 'waiting', 'active'],
    '60003' => ['outletperdele', 'labeling', 'active'],
    '60004' => ['trendhome', 'quality-control', 'active'],
    '60005' => ['outletperdele', 'ironing', 'cancelled'],
    '60006' => ['trendhome', 'delivery', 'active'],
] as $number => [$source, $stageId, $availability]) {
    $ingested = T::ingest($kernel, $source, T::sourceOrder((string) $number, "dashboard-e2e-{$number}", $changedAt, T::stage($stageId), 'processing', $availability));
    if (($ingested['body']['outcome'] ?? null) !== 'applied') {
        throw new RuntimeException('Overview fixture ingestion failed: ' . json_encode($ingested['body']));
    }
}
$container->employeeAdmin()->create('Ana Croitor', 'ana.overview.e2e', 'E2E-ANA', 'pregatire-material', 'employee', 'overview e2e passphrase 2026', ['labeling', 'delivery'], 'e2e');
$worker = T::login($kernel, 'ana.overview.e2e', 'overview e2e passphrase 2026');
$operate = static function (string $globalId, string $action, int $version) use ($kernel, $worker, $origin): void {
    $response = T::call($kernel, 'POST', '/orders/' . rawurlencode($globalId) . '/' . $action, ['expectedVersion' => $version], ['origin' => $origin, 'x-csrf-token' => $worker['csrf'], 'idempotency-key' => "overview-{$action}-" . substr($globalId, strpos($globalId, ':') + 1)], $worker['cookie']);
    if ($response['status'] !== 200) {
        throw new RuntimeException("Overview fixture {$action} failed: " . json_encode($response['body']));
    }
};
$operate('outletperdele:60003', 'claim', 1);
$operate('trendhome:60006', 'claim', 1);
$operate('trendhome:60006', 'transition', 2);
// Deterministic stage-entry times: 60003 entered its stage first, then 60001, 60004, 60002.
foreach (['60003' => 6, '60001' => 4, '60004' => 2, '60002' => 1] as $number => $hours) {
    $pdo->prepare('UPDATE operational_orders SET production_changed_at = NULL, created_at = :at WHERE order_number = :number')
        ->execute(['at' => gmdate('Y-m-d H:i:s', time() - $hours * 3600) . '.000000', 'number' => $number]);
}
// Production Control: one controlled Trendhome order (never a real customer order) with WC Kalkulator
// measurements, and a Staff worker for the waiting stage. The E2E suite drives it through the real API.
$controlled = [
    'schemaVersion' => 1, 'eventId' => 'dashboard-e2e-90001-1', 'changedAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 60),
    'order' => [
        'id' => '90001', 'number' => '90001', 'status' => ['code' => 'processing', 'label' => 'Se procesează'], 'availability' => 'active',
        'notes' => 'Tiv dublu la bază.', 'acceptedAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 3600),
        'items' => [
            ['id' => 900011, 'line' => 1, 'name' => 'Draperie Blackout', 'sku' => 'BO-210', 'variant' => 'Rejansă cu inele', 'color' => 'Gri', 'width' => 320, 'height' => 270.5, 'unit' => 'cm', 'meters' => 9.6, 'quantity' => 2],
            ['id' => 900012, 'line' => 2, 'name' => 'Perdea In', 'sku' => null, 'color' => null, 'width' => null, 'height' => null, 'unit' => null, 'meters' => null, 'quantity' => 1],
        ],
    ],
    'production' => ['workflowKey' => 'curtain-production', 'workflowVersion' => 1, 'stageId' => 'waiting'],
];
$ingested = T::ingest($kernel, 'trendhome', $controlled);
if (($ingested['body']['outcome'] ?? null) !== 'applied') {
    throw new RuntimeException('Controlled order ingestion failed: ' . json_encode($ingested['body']));
}
$container->employeeAdmin()->create('Mehmet Atölye', 'mehmet.control.e2e', 'E2E-MEH', 'pregatire-material', 'employee', 'control e2e passphrase 2026', ['waiting', 'material-preparation'], 'e2e');
// Production Control V2: a second Staff worker for the same stages, so ownership can move A -> B.
$container->employeeAdmin()->create('Ali Demir', 'ali.control.e2e', 'E2E-ALI', 'pregatire-material', 'employee', 'control e2e passphrase 2026', ['waiting', 'material-preparation'], 'e2e');

// OutletPerdele last spoke 30 minutes ago (stale); Trendhome just now (healthy); Trendyol has no credentials.
$pdo->prepare("UPDATE order_sources SET last_contact_at = :at WHERE source_key = 'outletperdele'")->execute(['at' => gmdate('Y-m-d H:i:s', time() - 1800) . '.000000']);

echo json_encode([
    'root' => ['id' => $rootId, 'username' => RootBootstrapService::ROOT_USERNAME, 'password' => $rootPassword],
    'role' => ['id' => (int) $role['role_id'], 'name' => (string) $role['name']],
    'stage' => ['id' => (string) $stage['stage_id'], 'label' => (string) $stage['label']],
    'department' => ['id' => (int) $department['department_id'], 'name' => (string) $department['name']],
    'control' => [
        'order' => 'trendhome:90001', 'number' => '90001',
        'worker' => ['username' => 'mehmet.control.e2e', 'password' => 'control e2e passphrase 2026', 'name' => 'Mehmet Atölye'],
        'second' => ['username' => 'ali.control.e2e', 'password' => 'control e2e passphrase 2026', 'name' => 'Ali Demir'],
    ],
    'production' => [
        'summary' => ['active' => 5, 'waiting' => 3, 'inWork' => 2, 'unassigned' => 4, 'completedToday' => 1],
        'stages' => ['waiting' => 3, 'labeling' => 1, 'quality-control' => 1, 'ironing' => 0, 'delivery' => 0],
        'oldest' => ['60003', '60001', '60004', '60002', '90001'],
        'sources' => ['outletperdele' => 'stale', 'trendhome' => 'healthy', 'trendyol' => 'not_configured'],
    ],
], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
