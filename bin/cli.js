#!/usr/bin/env node
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execPromise = util.promisify(exec);

program
    .version('1.0.0')
    .description('NestJS application generator');

program
    .command('create <app-name>')
    .description('Create a new NestJS application')
    .action(async (appName) => {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'modules',
                message: 'Enter module names (comma-separated):',
                filter: (input) => input.split(',').map(module => module.trim()).filter(module => module !== '')
            },
            {
                type: 'list',
                name: 'database',
                message: 'Select database:',
                choices: ['Postgres', 'MongoDB', 'MySQL']
            },
            {
                type: 'list',
                name: 'orm',
                message: 'Select ORM:',
                choices: ['TypeORM', 'Mongoose', 'Sequelize']
            },
            {
                type: 'confirm',
                name: 'interceptors',
                message: 'Create response and error interceptors?',
                default: true
            }
        ]);

        // Generate the application based on answers
        await generateApp(appName, answers);
    });

program.parse(process.argv);

async function generateApp(appName, config) {
    const appDir = path.join(process.cwd(), appName);

    // Create app directory
    await fs.ensureDir(appDir);

    // Generate base NestJS structure
    await generateBaseStructure(appDir);
    console.log(config.modules);
    // Generate selected modules
    config.modules = Array.isArray(config.modules) ? config.modules : config.modules.split(',').map(m => m.trim()).filter(m => m !== '');
    if(config.modules.length > 0){
        for (const module of config.modules) {
            console.log("Module----", module)
            await generateModule(appDir, module);
        }
    }


    // Set up database configuration
    await setupDatabase(appDir, config.database, config.orm);

    // Generate interceptors if selected
    if (config.interceptors) {
        await generateInterceptors(appDir);
    }

    console.log(chalk.green(`NestJS application ${appName} created successfully!`));
}

async function generateBaseStructure(appDir) {
    const appName = path.basename(appDir);
    const parentDir = path.dirname(appDir);

    console.log(`Generating NestJS application: ${appName}`);

    try {
        // Use NestJS CLI to generate the base application
        await execPromise(`nest new ${appName} --package-manager npm --skip-git --skip-install`, { cwd: parentDir });

        console.log('Base structure generated successfully using NestJS CLI.');

        // Additional customization can be done here
        // For example, adding custom files or modifying existing ones

    } catch (error) {
        console.error('Error generating base structure:', error);
        throw error;
    }
}

async function generateModule(appDir, moduleName) {
    // Create a 'modules' directory if it doesn't exist
    const modulesDir = path.join(appDir, 'src', 'modules');
    await fs.ensureDir(modulesDir);

    try {
        // Use NestJS CLI to generate the base application
        await execPromise(`nest g resource modules/${moduleName}`, { cwd: appDir });

        console.log(`Module ${moduleName} generated successfully using NestJS CLI.`);

        // Additional customization can be done here
        // For example, adding custom files or modifying existing ones

    } catch (error) {
        console.error(`Error generating module ${moduleName}:`, error);
        throw error;
    }
}

async function setupDatabase(appDir, database, orm) {
    console.log(`Setting up ${database} with ${orm}...`);

    // Install necessary dependencies
    const dependencies = getDatabaseDependencies(database, orm);
    await installDependencies(appDir, dependencies);

    // Create database configuration file
    await createDatabaseConfig(appDir, database, orm);

    // Update app module to import database module
    await updateAppModuleForDatabase(appDir, orm);

    console.log(`Database setup complete: ${database} with ${orm}`);
}

async function generateInterceptors(appDir) {
    const interceptorsDir = path.join(appDir, 'src/common/interceptors');
    await fs.ensureDir(interceptorsDir);

    console.log('Generating interceptors...');

    // Generate Response Interceptor
    await execPromise('nest g interceptor common/interceptors/response --no-spec', { cwd: appDir });

    // Generate Error Interceptor
    await execPromise('nest g interceptor common/interceptors/error --no-spec', { cwd: appDir });

    // Update the generated interceptors with our custom logic
    await updateResponseInterceptor(appDir);
    await updateErrorInterceptor(appDir);

    // Update AppModule to use the interceptors
    await updateAppModuleForInterceptors(appDir);

    console.log('Interceptors generated and configured successfully.');
}


function getDatabaseDependencies(database, orm) {
    const deps = [];
    switch (orm) {
        case 'TypeORM':
            deps.push('typeorm', '@nestjs/typeorm');
            break;
        case 'Mongoose':
            deps.push('mongoose', '@nestjs/mongoose');
            break;
        case 'Sequelize':
            deps.push('sequelize', '@nestjs/sequelize', 'sequelize-typescript');
            break;
    }

    switch (database) {
        case 'PostgreSQL':
            deps.push('pg');
            break;
        case 'MongoDB':
            if (orm !== 'Mongoose') deps.push('mongodb');
            break;
        case 'MySQL':
            deps.push('mysql2');
            break;
    }

    return deps;
}

async function installDependencies(appDir, dependencies) {
    console.log('Installing database dependencies...');
    const command = `npm install ${dependencies.join(' ')} --save`;
    await execPromise(command, { cwd: appDir });
}

async function createDatabaseConfig(appDir, database, orm) {
    const configDir = path.join(appDir, 'src', 'config');
    await fs.ensureDir(configDir);

    const configPath = path.join(configDir, 'database.config.ts');
    let configContent = '';

    switch (orm) {
        case 'TypeORM':
            configContent = getTypeORMConfig(database);
            break;
        case 'Mongoose':
            configContent = getMongooseConfig();
            break;
        case 'Sequelize':
            configContent = getSequelizeConfig(database);
            break;
    }

    await fs.writeFile(configPath, configContent);
    console.log(`Database configuration file created: ${configPath}`);
}

function getTypeORMConfig(database) {
    return `
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig: TypeOrmModuleOptions = {
  type: '${database.toLowerCase()}',
  host: 'localhost',
  port: ${database === 'PostgreSQL' ? 5432 : 3306},
  username: 'your_username',
  password: 'your_password',
  database: 'your_database',
  entities: ['dist/**/*.entity{.ts,.js}'],
  synchronize: true, // set to false in production
};
`;
}

function getMongooseConfig() {
    return `
export const databaseConfig = {
  uri: 'mongodb://localhost/your_database',
  useNewUrlParser: true,
  useUnifiedTopology: true,
};
`;
}

function getSequelizeConfig(database) {
    return `
import { SequelizeModuleOptions } from '@nestjs/sequelize';

export const databaseConfig: SequelizeModuleOptions = {
  dialect: '${database.toLowerCase()}',
  host: 'localhost',
  port: ${database === 'PostgreSQL' ? 5432 : 3306},
  username: 'your_username',
  password: 'your_password',
  database: 'your_database',
  autoLoadModels: true,
  synchronize: true, // set to false in production
};
`;
}

async function updateAppModuleForDatabase(appDir, orm) {
    const appModulePath = path.join(appDir, 'src', 'app.module.ts');
    let content = await fs.readFile(appModulePath, 'utf8');

    let importStatement = '';
    let moduleImport = '';

    switch (orm) {
        case 'TypeORM':
            importStatement = "import { TypeOrmModule } from '@nestjs/typeorm';\nimport { databaseConfig } from './config/database.config';";
            moduleImport = ',TypeOrmModule.forRoot(databaseConfig),';
            break;
        case 'Mongoose':
            importStatement = "import { MongooseModule } from '@nestjs/mongoose';\nimport { databaseConfig } from './config/database.config';";
            moduleImport = ',MongooseModule.forRoot(databaseConfig.uri),';
            break;
        case 'Sequelize':
            importStatement = "import { SequelizeModule } from '@nestjs/sequelize';\nimport { databaseConfig } from './config/database.config';";
            moduleImport = ',SequelizeModule.forRoot(databaseConfig),';
            break;
    }

    content = `${importStatement}\n${content}`;
    content = content.replace(
        /imports:\s*\[([\s\S]*?)\]/,
        `imports: [$1\n    ${moduleImport}\n  ]`
    );

    await fs.writeFile(appModulePath, content);
    console.log('AppModule updated with database configuration.');
}

async function updateResponseInterceptor(appDir) {
    const filePath = path.join(appDir, 'src', 'common/interceptors/response', 'response.interceptor.ts');
    const content = `
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map(data => ({
        statusCode: context.switchToHttp().getResponse().statusCode,
        message: 'Success',
        data,
      })),
    );
  }
}
`;

    await fs.writeFile(filePath, content);
    console.log('Response interceptor updated.');
}

async function updateErrorInterceptor(appDir) {
    const filePath = path.join(appDir, 'src', 'common/interceptors/error', 'error.interceptor.ts');
    const content = `
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(err => {
        if (err instanceof HttpException) {
          return throwError(() => err);
        }
        return throwError(() => new HttpException({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: err.message,
        }, HttpStatus.INTERNAL_SERVER_ERROR));
      }),
    );
  }
}
`;

    await fs.writeFile(filePath, content);
    console.log('Error interceptor updated.');
}

async function updateAppModuleForInterceptors(appDir) {
    const appModulePath = path.join(appDir, 'src', 'app.module.ts');
    let content = await fs.readFile(appModulePath, 'utf8');

    const importStatement = `
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from './common/interceptors/response/response.interceptor';
import { ErrorInterceptor } from './common/interceptors/error/error.interceptor';`;

    const providerStatements = `,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorInterceptor,
    },`;

    content = `${importStatement}\n${content}`;
    content = content.replace(
        /providers:\s*\[([\s\S]*?)\]/,
        `providers: [$1${providerStatements}\n  ]`
    );

    await fs.writeFile(appModulePath, content);
    console.log('AppModule updated with interceptors.');
}
