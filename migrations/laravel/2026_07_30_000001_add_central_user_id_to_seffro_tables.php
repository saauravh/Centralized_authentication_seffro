<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasColumn('users', 'central_user_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->bigInteger('central_user_id')->nullable()->unique()->after('id');
            });
        }
        if (!Schema::hasColumn('vendors', 'central_user_id')) {
            Schema::table('vendors', function (Blueprint $table) {
                $table->bigInteger('central_user_id')->nullable()->unique()->after('id');
            });
        }
        if (!Schema::hasColumn('agents', 'central_user_id')) {
            Schema::table('agents', function (Blueprint $table) {
                $table->bigInteger('central_user_id')->nullable()->unique()->after('id');
            });
        }
    }

    public function down()
    {
        if (Schema::hasColumn('users', 'central_user_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('central_user_id');
            });
        }
        if (Schema::hasColumn('vendors', 'central_user_id')) {
            Schema::table('vendors', function (Blueprint $table) {
                $table->dropColumn('central_user_id');
            });
        }
        if (Schema::hasColumn('agents', 'central_user_id')) {
            Schema::table('agents', function (Blueprint $table) {
                $table->dropColumn('central_user_id');
            });
        }
    }
};
