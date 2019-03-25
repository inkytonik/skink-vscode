'use strict';

import { ExtensionContext, workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient';
import { Monto } from './monto';

let client: LanguageClient;

export function activate(context: ExtensionContext) {

    const settings = workspace.getConfiguration("skink");
    const logConfigPath = context.extensionPath + "/resources";

    const java = settings.get("java", "/usr/bin/java");
    const jar = settings.get("jar");
    const classpath = `${jar}:${logConfigPath}`;
    const main = "au.edu.mq.comp.skink.Main";

    const args = [
        "-classpath", classpath,
        main,
        "--server"
    ];

    const serverOptions: ServerOptions = {
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

    const clientOptions: LanguageClientOptions = {
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
