import { commands, ExtensionContext, EventEmitter, ProviderResult, Range,
  Selection, TextDocumentContentProvider, TextEditor,
  TextEditorRevealType, TextEditorSelectionChangeEvent, TreeDataProvider,
  TreeItem, TreeItemCollapsibleState, Uri, ViewColumn, WebviewPanel,
  workspace, window }
  from 'vscode';
import { NotificationType } from 'vscode-jsonrpc';
import { LanguageClient, DidChangeConfigurationNotification } from
  'vscode-languageclient';
import { basename, sep } from 'path';

export namespace Monto {

    // Products

    export interface Product {
        uri: string;
        name: string;
        language: string;
        content: string;
        append: boolean;
        rangeMap: RangeEntry[];
        rangeMapRev: RangeEntry[];

        // Internal fields
        handleSelectionChange: boolean;
    }

    export interface RangeEntry {
        source: OffsetRange;
        targets: OffsetRange[];
    }

    export interface OffsetRange {
        start: number; end: number;
    }

    namespace PublishProduct {
        export const type = new NotificationType<Product, void>(
            "monto/publishProduct"
        );
    }

    // Tree view entries

    interface Node {
        name: string;
        fullName?: string;
        children: Node[];
        product?: Product;
    }

    function rootNode(): Node {
        return {
            name: "Products",
            fullName: undefined,
            children: [],
            product: undefined,
        };
    }

    function makeNode(parent: Node, key: string, prod?: Product): Node {
        return {
            name: key,
            fullName: (parent.fullName === undefined) ? key : `${parent.fullName} ${key}`,
            children: [],
            product: prod
        };
    }

    function trimExtension(filename : string): string {
        let index = filename.lastIndexOf('.');
        if (index === -1) {
            return filename;
        } else {
            return filename.substring(0, index);
        }
    }

    function pushNode(parent : Node, node : Node) {
        parent.children.push(node);
        parent.children.sort((a, b) =>
            trimExtension(a.name).localeCompare(trimExtension(b.name))
        );
    }

    function insertProduct(parent : Node, product: Product) {
        insert(parent, productToName(product).split(productSeparator), product);
    }

    function insert(parent : Node, keys: string[], product: Product) {
        let key = keys[0];
        let oldNode = parent.children.find(n => n.name === key);
        if (keys.length === 1) {
            let newNode = makeNode(parent, key, product);
            if (oldNode === undefined) {
                pushNode(parent, newNode);
            } else {
                let oldIndex = parent.children.indexOf(oldNode);
                parent.children[oldIndex] = newNode;
            }
        } else {
            let newKeys = keys.slice(1);
            if (oldNode === undefined) {
                let newNode = makeNode(parent, key, undefined);
                pushNode(parent, newNode);
                insert(newNode, newKeys, product);
            } else {
                insert(oldNode, newKeys, product);
            }
        }
    }

    // Product data

    // Map Monto uri strings to latest version of their products
    let products = new Map<string, Product>();

    // Tree of product data
    let productTree : Node = rootNode();

    // Map all uri strings to the view column in which they are displayed
    let columns = new Map<string, ViewColumn>();

    // Product operations

    let productSeparator = "|";

    function clearProducts(filename : string) {
        let uri = Uri.file(filename).toString();
        productTree = rootNode();
        products.forEach((product, key) => {
            if (product.uri === uri) {
                products.delete(key);
            } else {
                insertProduct(productTree, product);
            }
        });
        updateTree();

        window.visibleTextEditors.forEach(
            editor => {
                if (isMontoEditor(editor)) {
                    montoProductProvider.onDidChangeEmitter.fire(editor.document.uri);
                }
            }
        );
    }

    function saveProduct(product: Product) {
        let uri = productToTargetUri(product);
        let key = uri.toString();
        let prevProduct = products.get(key);
        if (product.append && prevProduct !== undefined) {
            product.content = prevProduct.content + product.content;
        }
        products.set(key, product);
        product.handleSelectionChange = false;
        if (product.language === 'svg') {
            updateSVGInWebView(product);
        } else {
            montoProductProvider.onDidChangeEmitter.fire(uri);
        }
        insertProduct(productTree, product);
        updateTree();
    }

    function openProduct(context: ExtensionContext, product : Product, fullName : string) {
        if (product.language === 'svg') {
            openSVGInWebView(context, product, fullName, true);
        } else {
            openInEditor(productToTargetUri(product), true);
        }
    }

    function getProduct(uri: Uri): Product {
        let p = products.get(uri.toString());
        if (p === undefined) {
            let dummyRange = {
                source: { start: 0, end: 0 },
                targets: [{ start: 0, end: 0 }]
            };
            return {
                uri: "",
                name: "",
                language: "",
                content: "",
                append: false,
                rangeMap: [dummyRange],
                rangeMapRev: [dummyRange],
                handleSelectionChange: false
            };
        } else {
            return p;
        }
    }

    function productToName(product : Product): string {
        let path = Uri.parse(product.uri).path;
        return `${path}${productSeparator}${product.name}.${product.language}`;
    }

    function productToTargetUri(product: Product): Uri {
        return Uri.parse(`monto:${productToName(product)}`);
    }

    function targetUriToSourceUri(uri: Uri): Uri {
        let path = uri.path.substring(0, uri.path.indexOf(productSeparator));
        return Uri.parse(`file:${path}`);
    }

    // Monto URI scheme and providers

    const montoScheme = 'monto';

    const montoProductProvider = new class implements TextDocumentContentProvider {
        onDidChangeEmitter = new EventEmitter<Uri>();

        provideTextDocumentContent(uri: Uri): string {
            let product = products.get(uri.toString());
            if (product === undefined) {
                // Note: an empty string doesn't work here. It's as if
                // the content doesn't change...
                return " ";
            } else {
                return product.content;
            }
        }

        get onDidChange() {
            return this.onDidChangeEmitter.event;
        }

        dispose() {
            this.onDidChangeEmitter.dispose();
        }
    };

    const montoProductsProvider = new class implements TreeDataProvider<Node> {
        _onDidChangeTreeData = new EventEmitter<Node | undefined>();
        readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

        // TreeDataProvider API

        getChildren(node?: Node): ProviderResult<Node[]> {
            if (node === undefined) {
                return [productTree];
            } else {
                return node.children;
            }
        }

        getTreeItem(node: Node): TreeItem {
            let index = node.name.lastIndexOf(`${sep}`);
            let shortName = (index === -1) ? node.name : node.name.slice(index + 1);
            let item = new TreeItem(shortName);
            item.tooltip = node.fullName;
            if (shortName === "Products") {
                item.collapsibleState = TreeItemCollapsibleState.Expanded;
            } else if (node.children.length > 0) {
                item.collapsibleState = TreeItemCollapsibleState.Collapsed;
            } else {
                item.collapsibleState = TreeItemCollapsibleState.None;
            }
            if (node.product === undefined) {
                if (node.fullName !== undefined) {
                    item.command = {
                        title: "Open File",
                        command: `monto.openUri`,
                        arguments: [ Uri.file(node.fullName) ],
                        tooltip: "Open ${node.fullName} file"
                    };
                }
            } else {
                item.command = {
                    title: "Show Product",
                    command: "monto.openProduct",
                    arguments: [ node.product, node.fullName ],
                    tooltip: "Open ${shortName} product"
                };
                item.resourceUri = productToTargetUri(node.product);
            }
            return item;
        }

    };

    function updateTree() {
        montoProductsProvider._onDidChangeTreeData.fire(undefined);
    }

    // Setup

    export function setup(
            name: string,
            context: ExtensionContext,
            client: LanguageClient
        ) {

        window.createTreeView(`${name}-products`, {
            showCollapseAll: true,
            treeDataProvider: montoProductsProvider
        });

        workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(name)) {
                sendConfigurationToServer(client, name);
            }
        });

        workspace.onDidChangeTextDocument(change => {
            let settings = workspace.getConfiguration(name);
            if (settings.get(`${name}.updateOnChange`)) {
                clearProducts(change.document.fileName);
            }
        });

        window.onDidChangeTextEditorSelection(change => {
            if (isMontoEditor(change.textEditor)) {
                selectLinkedSourceRanges(change);
            }
        });

        workspace.onDidCloseTextDocument(change => {
            clearProducts(change.fileName);
        });

        workspace.onDidSaveTextDocument(change => {
            clearProducts(change.fileName);
        });

        window.onDidChangeVisibleTextEditors(editors => {
            editors.forEach(editor => {
                if (editor.viewColumn !== undefined) {
                    columns.set(editor.document.uri.toString(), editor.viewColumn);
                }
            });
        });

        context.subscriptions.push(
            commands.registerCommand("monto.openProduct",
                (product : Product, fullName : string) =>
                    openProduct(context, product, fullName)
            )
        );

        context.subscriptions.push(
            commands.registerCommand("monto.openUri",
                (uri : Uri) =>
                    openInEditor(uri, true)
            )
        );

        context.subscriptions.push(
            commands.registerCommand("monto.selectLinkedEditors",
                () =>
                    selectLinkedTargetRanges()
            )
        );

        context.subscriptions.push(
            workspace.registerTextDocumentContentProvider(montoScheme, montoProductProvider)
        );

        client.clientOptions.initializationOptions = workspace.getConfiguration(name);

        client.onReady().then(_ => {
            client.onNotification(PublishProduct.type,
                (product: Product) => {
                    saveProduct(product);
            });
        });
    }

    function sendConfigurationToServer(client: LanguageClient, name: string) {
        client.sendNotification(
            DidChangeConfigurationNotification.type.method,
            { settings: workspace.getConfiguration(name) }
        );
    }

    function isMontoEditor(editor: TextEditor): Boolean {
        return editor.document.uri.scheme === 'monto';
    }

    // Source to target linking

    function selectLinkedTargetRanges() {
        let editor = window.activeTextEditor;
        if (editor !== undefined) {
            let sourceEditor = editor;
            let sourceUri = sourceEditor.document.uri.toString();
            let sourceSelections = sourceEditor.selections;
            window.visibleTextEditors.forEach(targetEditor => {
                if (isMontoEditor(targetEditor)) {
                    let targetUri = targetEditor.document.uri;
                    let targetSourceUri = targetUriToSourceUri(targetUri);
                    if (targetSourceUri.toString() === sourceUri) {
                        let product = getProduct(targetUri);
                        let targetSelections =
                            flatten(sourceSelections.map(sourceSelection => {
                                return getSelections(product, sourceEditor, sourceSelection, targetEditor, true);
                            }));
                        if (targetSelections.length > 0) {
                            product.handleSelectionChange = false;
                            showSelections(targetUri, targetEditor, targetSelections, true);
                        }
                    }
                }
            });
        }
    }

    // Target to source linking

    function selectLinkedSourceRanges(change: TextEditorSelectionChangeEvent) {
        let targetEditor = change.textEditor;
        let targetUri = targetEditor.document.uri;
        let sourceUri = targetUriToSourceUri(targetUri);
        openInEditor(sourceUri, false).then(sourceEditor => {
            let product = getProduct(targetUri);
            if (product.handleSelectionChange) {
                let sourceSelections =
                    flatten(change.selections.map(targetSelection =>
                        getSelections(product, targetEditor, targetSelection, sourceEditor, false)
                    ));
                if (sourceSelections.length > 0) {
                    showSelections(sourceUri, sourceEditor, sourceSelections, false);
                }
            } else {
                product.handleSelectionChange = true;
            }
        });
    }

    // Utilities

    function flatten(ranges: Range[][]): Range[] {
        return ranges.reduce((a, b) => a.concat(b));
    }

    function getSelections(product : Product, fromEditor: TextEditor, fromSelection: Selection, toEditor: TextEditor, forward: boolean): Range[] {
        let fromOffset = fromEditor.document.offsetAt(fromSelection.start);
        let entry = findContainingRangeEntry(product, fromOffset, forward);
        if (entry === undefined) {
            return [new Range(0, 0, 0, 0)];
        } else {
            return targetsToSelections(toEditor, entry.targets);
        }
    }

    function findContainingRangeEntry(product: Product, offset: number, forward: boolean): RangeEntry| undefined {
        let map = forward ? product.rangeMap : product.rangeMapRev;
        return map.find(entry =>
            (entry.source.start <= offset) && (offset < entry.source.end)
        );
    }

    function targetsToSelections(editor: TextEditor, targets: OffsetRange[]): Range[] {
        return targets.map(target => {
            return targetToSelection(editor, target);
        });
    }

    function targetToSelection(editor: TextEditor, target: OffsetRange): Range {
        let s = editor.document.positionAt(target.start);
        let f = editor.document.positionAt(target.end);
        return new Range(s, f);
    }

    function viewColumn(uri: Uri, isTarget: Boolean): ViewColumn {
        let key = uri.toString();
        let column = columns.get(key);
        if (column === undefined) {
            let original = isTarget ? ViewColumn.Two : ViewColumn.One;
            columns.set(key, original);
            return original;
        } else {
            return column;
        }
    }

    function showSelections(uri : Uri, editor: TextEditor, selections: Range[], isTarget: Boolean) {
        window.showTextDocument(
            editor.document,
            {
                preserveFocus: false,
                preview: false,
                viewColumn: viewColumn(uri, isTarget)
            }
        );
        editor.selections = selections.map(s => new Selection(s.start, s.end));
        editor.revealRange(selections[0], TextEditorRevealType.InCenterIfOutsideViewport);
    }

    function openInEditor(uri: Uri, isTarget: boolean): Thenable<TextEditor> {
        return window.showTextDocument(
            uri,
            {
                preserveFocus: true,
                preview: false,
                viewColumn: viewColumn(uri, isTarget)
            }
        );
    }

    // SVG web view panels

    interface SVGWebViewPanel {
        context: ExtensionContext;
        panel: WebviewPanel;
        resource: Uri;
    }

    let openSVGWebViews : SVGWebViewPanel[] = [];

    function getOpenSVGWebView(uri: Uri): SVGWebViewPanel | undefined {
        return openSVGWebViews.find(panel => panel.resource.fsPath === uri.fsPath);
    }

    function addOpenSVGWebView(view: SVGWebViewPanel) {
        view.panel.onDidDispose(() => {
            openSVGWebViews.splice(openSVGWebViews.indexOf(view), 1);
        });
        openSVGWebViews.push(view);
    }

    function openSVGInWebView(context: ExtensionContext, product: Product, fullName : string, isTarget: boolean) {
        let uri = productToTargetUri(product);
        let view = getOpenSVGWebView(uri);
        if (view === undefined) {
            view = {
                context: context,
                panel: window.createWebviewPanel(
                    "HELLO",
                    basename(fullName),
                    viewColumn(uri, isTarget),
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true
                    }
                ),
                resource: uri
            };
            addOpenSVGWebView(view);
        }
        updateSVGWebViewContent(view, product);
        view.panel.reveal(view.panel.viewColumn, true);
    }

    function updateSVGInWebView(product: Product) {
        let uri = productToTargetUri(product);
        let view = getOpenSVGWebView(uri);
        if (view !== undefined) {
            updateSVGWebViewContent(view, product);
        }
    }

    function updateSVGWebViewContent(view : SVGWebViewPanel, product : Product) {
        let html =
            `<div>
                <script
                    type="text/javascript"
                    src="vscode-resource:${view.context.extensionPath}/scripts/svg-pan-zoom.min.js">
                </script>
                <div id="product">
                    ${product.content}
                </div>
                <script type="text/javascript">
                    onload = function() {
                        svgPanZoom('#product svg', {
                            center: true,
                            fit: true,
                            mouseWheelZoomEnabled: true,
                            zoomEnabled: true,
                        })
                    };
                </script>
            </div>`;
        view.panel.webview.html = html;
    }

}
