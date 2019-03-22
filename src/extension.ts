'use strict';

import { ExtensionContext, workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient';
import { Monto } from './monto';

let client: LanguageClient;

export function activate(context: ExtensionContext) {

    let settings = workspace.getConfiguration("skink");
    let logConfigPath = context.extensionPath + "/resources";

    let java = settings.get("java", "/usr/bin/java");
    let jar = settings.get("jar");
    let classpath = `${jar}:${logConfigPath}`;
    let main = "au.edu.mq.comp.skink.Main";

    let args = [
        "-classpath", classpath,
        main,
        "--server"
    ];

    let serverOptions: ServerOptions = {
        run: {
            command: java,
            args: args,
            options: {
            }
        },
        debug: {
            command: java,
            args: args.concat(["--debug"]),
            options: {
            }
        }
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            {
                scheme: 'file',
                language: 'c'
            }
        ],
        diagnosticCollectionName: "skink"
    };

    client = new LanguageClient(
        'skinkLanguageServer',
        'Skink Language Server',
        serverOptions,
        clientOptions
    );

    Monto.setup("skink", context, client);

    context.subscriptions.push(client.start());
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
