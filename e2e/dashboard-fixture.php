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
$config = T::config($dbName, [$origin]);
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

echo json_encode([
    'root' => ['id' => $rootId, 'username' => RootBootstrapService::ROOT_USERNAME, 'password' => $rootPassword],
    'role' => ['id' => (int) $role['role_id'], 'name' => (string) $role['name']],
    'stage' => ['id' => (string) $stage['stage_id'], 'label' => (string) $stage['label']],
    'department' => ['id' => (int) $department['department_id'], 'name' => (string) $department['name']],
], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
