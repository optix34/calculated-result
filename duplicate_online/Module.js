Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        const me = this;

        // Левая панель (только интерфейс, без загрузки данных)
        const navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 700,
            layout: 'vbox',
            items: [
                me.buildToolbar(),
                me.buildTreePanel()
            ]
        });

        // Правая панель (разделена по горизонтали)
        const mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel', flex: 1, bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel', flex: 1, bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>'
            }]
        });

        // Интеграция с PILOT
        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        const mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    // Создание тулбара с кнопками
    buildToolbar: function() {
        return Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: l('Все'),         enableToggle: true, toggleGroup: 'statefilter', pressed: true,
                handler: () => this.filterTree('all')
            }, {
                text: l('Активные'),    enableToggle: true, toggleGroup: 'statefilter',
                handler: () => this.filterTree(1)
            }, {
                text: l('Аварии'),      enableToggle: true, toggleGroup: 'statefilter',
                handler: () => this.filterTree(2)
            }, {
                text: l('Стоянка'),     enableToggle: true, toggleGroup: 'statefilter',
                handler: () => this.filterTree(3)
            }, {
                text: l('Холостой ход'), enableToggle: true, toggleGroup: 'statefilter',
                handler: () => this.filterTree(4)
            }, '->', {
                xtype: 'textfield',
                emptyText: l('Поиск...'),
                enableKeyEvents: true,
                listeners: { keyup: (field) => this.searchTree(field.getValue()) }
            }]
        });
    },

    // Создание панели дерева
    buildTreePanel: function() {
        this.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] }
        });

        this.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: this.treeStore,
            rootVisible: false,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn',
                text: l('Объекты'),
                dataIndex: 'text',
                flex: 2
            }, {
                text: l('Статус'),
                dataIndex: 'state',
                width: 100,
                renderer: (v) => this.renderState(v)
            }, {
                text: l('Скорость'),
                dataIndex: 'speed',
                width: 80
            }]
        });

        // Загружаем данные ПОСЛЕ создания дерева
        this.loadData();
        return this.tree;
    },

    // Загрузка данных с сервера
    loadData: function(stateValue = 'all') {
        const stateParam = (stateValue === 'all') ? 1 : stateValue;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: stateParam },
            success: (response) => {
                const data = Ext.decode(response.responseText);
                const root = this.treeStore.getRootNode();
                root.removeAll();
                if (data && data.length) {
                    this.addNodes(root, data);
                    root.expandChildren(true, false);
                } else {
                    Ext.Msg.alert('Внимание', 'Нет данных для отображения.');
                }
            },
            failure: () => Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные.')
        });
    },

    // Рекурсивное добавление узлов в дерево
    addNodes: function(parent, nodes) {
        if (!Ext.isArray(nodes)) nodes = [nodes];
        Ext.each(nodes, (node) => {
            const isLeaf = !node.children || node.children.length === 0;
            const newNode = parent.appendChild({
                text: node.text || node.name || node.id,
                leaf: isLeaf,
                state: node.state,
                speed: node.speed,
                id: node.id
            });
            if (node.children && node.children.length) {
                this.addNodes(newNode, node.children);
            }
        });
    },

    // Фильтрация дерева по состоянию
    filterTree: function(stateValue) {
        this.loadData(stateValue);
    },

    // Поиск по дереву (фильтрация видимости)
    searchTree: function(query) {
        const root = this.treeStore.getRootNode();
        if (!root) return;

        // Сначала показываем все узлы
        root.cascadeBy(node => node.set('visible', true));

        if (!query || query.length < 2) return;

        const lowerQuery = query.toLowerCase();
        // Скрываем все узлы
        root.cascadeBy(node => { if (node !== root) node.set('visible', false); });
        // Показываем совпадающие и их предков
        root.cascadeBy(node => {
            if (node !== root && (node.get('text') || '').toLowerCase().indexOf(lowerQuery) !== -1) {
                node.set('visible', true);
                let parent = node.parentNode;
                while (parent && parent !== root) {
                    parent.set('visible', true);
                    parent = parent.parentNode;
                }
            }
        });
    },

    // Вспомогательная функция для отображения статуса
    renderState: function(state) {
        switch(state) {
            case 1: return '<span style="color:green;">Активен</span>';
            case 2: return '<span style="color:red;">Авария</span>';
            case 3: return '<span style="color:orange;">Стоянка</span>';
            case 4: return '<span style="color:gray;">Холостой ход</span>';
            default: return '—';
        }
    }
});
