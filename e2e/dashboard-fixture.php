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
// A second active department, offered as an additional (secondary) function on the employee page.
$pdo->exec("INSERT INTO departments (department_key, name, status, created_at, updated_at) VALUES ('e2e-depozit', 'Depozit E2E', 'active', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))");

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

// Production exceptions: two operations managers with the one shared role, plus a cutting employee and a
// tailoring intake employee.
$exceptionPassword = 'exceptions e2e passphrase 2026';
$opsRole = (int) $pdo->query("SELECT role_id FROM roles WHERE role_key = 'operations-manager'")->fetchColumn();
$managers = [];
foreach (['denisa.ops.e2e' => 'Denisa Voican', 'hikmet.ops.e2e' => 'Hikmet Yerlikaya'] as $username => $name) {
    $manager = $container->employeeAdmin()->create($name, $username, null, 'pregatire-material', 'employee', $exceptionPassword, [], 'e2e');
    // The root of this disposable database still holds its one-time password (the suite changes it in the
    // browser), so the official IAM service correctly refuses root actions here; the grants are written
    // directly into the test database instead. Production never uses this path.
    $pdo->prepare('DELETE FROM employee_application_access WHERE employee_uuid = ?')->execute([$manager->employeeUuid]);
    $pdo->prepare("INSERT INTO employee_application_access (employee_uuid, application_key, granted_at) VALUES (?, 'dashboard', UTC_TIMESTAMP(6))")->execute([$manager->employeeUuid]);
    $pdo->prepare('INSERT INTO employee_role_assignments (employee_uuid, role_id, assigned_at) VALUES (?, ?, UTC_TIMESTAMP(6))')->execute([$manager->employeeUuid, $opsRole]);
    $pdo->prepare("UPDATE employees SET position_title = 'Manager operațional' WHERE employee_uuid = ?")->execute([$manager->employeeUuid]);
    $managers[] = ['username' => $username, 'name' => $name];
}
$container->employeeAdmin()->create('Crama Florin', 'crama.cut.e2e', null, 'pregatire-material', 'employee', $exceptionPassword, ['material-preparation'], 'e2e');
$container->employeeAdmin()->create('Andrea Tăiere', 'andrea.cut.e2e', null, 'pregatire-material', 'employee', $exceptionPassword, ['material-preparation'], 'e2e');
$container->employeeAdmin()->create('Oprea Doina', 'oprea.intake.e2e', null, 'pregatire-material', 'employee', $exceptionPassword, ['workshop-receiving'], 'e2e');
// The cutting-fault orders are created by the approvals spec itself (it runs last), so the production
// overview figures asserted by the earlier specs stay unchanged.

// Production documents: the primary revision approver, a CEO-appointed temporary backup (active window)
// and a channel requester. Test-database grants only, as for the managers above.
$documentPeople = [];
foreach (['sinem.doc.e2e' => ['Sinem Yetiș', 'document-revision-approver'], 'backup.doc.e2e' => ['Bogdan Înlocuitor', null], 'online.doc.e2e' => ['Ioana Online', 'production-documents-operator']] as $username => [$name, $roleKey]) {
    $person = $container->employeeAdmin()->create($name, $username, null, 'pregatire-material', 'employee', $exceptionPassword, [], 'e2e');
    $pdo->prepare('DELETE FROM employee_application_access WHERE employee_uuid = ?')->execute([$person->employeeUuid]);
    $pdo->prepare("INSERT INTO employee_application_access (employee_uuid, application_key, granted_at) VALUES (?, 'dashboard', UTC_TIMESTAMP(6))")->execute([$person->employeeUuid]);
    if ($roleKey !== null) {
        $pdo->prepare('INSERT INTO employee_role_assignments (employee_uuid, role_id, assigned_at) SELECT ?, role_id, UTC_TIMESTAMP(6) FROM roles WHERE role_key = ?')->execute([$person->employeeUuid, $roleKey]);
    }
    $documentPeople[$username] = $person->employeeUuid;
}
// API 2.22+: a document permission reaches only the sources scoped to the identity (root-granted in
// production; written directly here, like the role grants above).
if ($pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'employee_document_scopes'")->fetchColumn() > 0) {
    $scope = $pdo->prepare("INSERT INTO employee_document_scopes (employee_uuid, capability, source_key, granted_at, granted_by_employee_uuid)
        SELECT ?, ?, source_key, UTC_TIMESTAMP(6), ? FROM order_sources WHERE status = 'active'");
    foreach (['sinem.doc.e2e' => 'approve', 'backup.doc.e2e' => 'approve', 'online.doc.e2e' => 'operate'] as $username => $capability) {
        $scope->execute([$documentPeople[$username], $capability, $rootId]);
    }
}
$pdo->prepare("INSERT INTO responsibility_assignments (assignment_uuid, responsibility_key, employee_uuid, starts_at, ends_at, note, created_at, created_by_employee_uuid)
    VALUES (UUID(), 'document_revision_backup_approver', ?, UTC_TIMESTAMP(6) - INTERVAL 1 HOUR, UTC_TIMESTAMP(6) + INTERVAL 10 DAY, 'E2E backup', UTC_TIMESTAMP(6), ?)")->execute([$documentPeople['backup.doc.e2e'], $rootId]);

// OutletPerdele last spoke 30 minutes ago (stale); Trendhome just now (healthy); Trendyol has no credentials.
$analyticsReader=$container->employeeAdmin()->create('YETIS SINEM · Analiză test','sinem.analytics.e2e',null,'conducere','employee',$exceptionPassword,[],'e2e');
$analyticsRole=(int)$pdo->query("SELECT role_id FROM roles WHERE role_key='analytics-reader'")->fetchColumn();
$pdo->prepare("UPDATE order_sources SET last_contact_at = :at WHERE source_key = 'outletperdele'")->execute(['at' => gmdate('Y-m-d H:i:s', time() - 1800) . '.000000']);

echo json_encode([
    'root' => ['id' => $rootId, 'username' => RootBootstrapService::ROOT_USERNAME, 'password' => $rootPassword],
    'analytics' => ['readerId'=>$analyticsReader->employeeUuid,'readerUsername'=>'sinem.analytics.e2e','readerPassword'=>$exceptionPassword,'roleId'=>$analyticsRole],
    'role' => ['id' => (int) $role['role_id'], 'name' => (string) $role['name']],
    'stage' => ['id' => (string) $stage['stage_id'], 'label' => (string) $stage['label']],
    'department' => ['id' => (int) $department['department_id'], 'name' => (string) $department['name']],
    'control' => [
        'order' => 'trendhome:90001', 'number' => '90001',
        'worker' => ['username' => 'mehmet.control.e2e', 'password' => 'control e2e passphrase 2026', 'name' => 'Mehmet Atölye'],
        'second' => ['username' => 'ali.control.e2e', 'password' => 'control e2e passphrase 2026', 'name' => 'Ali Demir'],
    ],
    'documents' => ['approver' => 'sinem.doc.e2e', 'backup' => 'backup.doc.e2e', 'requester' => 'online.doc.e2e', 'password' => $exceptionPassword],
    'exceptions' => [
        'password' => $exceptionPassword,
        'managers' => $managers,
        'cutter' => 'crama.cut.e2e',
        'intake' => 'oprea.intake.e2e',
    ],
    'production' => [
        'summary' => ['active' => 5, 'waiting' => 3, 'inWork' => 2, 'unassigned' => 4, 'completedToday' => 1],
        'stages' => ['waiting' => 3, 'labeling' => 1, 'quality-control' => 1, 'ironing' => 0, 'delivery' => 0],
        'oldest' => ['60003', '60001', '60004', '60002', '90001'],
        'sources' => ['outletperdele' => 'stale', 'trendhome' => 'healthy', 'trendyol' => 'not_configured'],
    ],
], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
