Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (дерево)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 800,
            layout: 'vbox',
            items: [me.buildToolbar(), me.buildTree()]
        });

        // Правая панель (пустая, разделённая)
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel', flex: 1,
                html: '<div style="padding:20px;text-align:center;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel', flex: 1,
                html: '<div style="padding:20px;text-align:center;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);

        me.loadData(); // загружаем данные при старте
    },

    buildToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: 'Обновить',
                handler: function() { me.loadData(); }
            }, {
                text: 'Показать консоль',
                handler: function() { console.log('Данные в дереве:', me.store.getRootNode().childNodes); }
            }]
        });
    },

    buildTree: function() {
        var me = this;
        me.store = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] }
        });
        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.store,
            rootVisible: false,
            useArrows: true,
            columns: [{
                xtype: 'treecolumn',
                text: 'Объекты',
                dataIndex: 'text',
                flex: 2
            }, {
                text: 'Статус',
                dataIndex: 'state',
                width: 100
            }, {
                text: 'Скорость',
                dataIndex: 'speed',
                width: 80
            }]
        });
        return me.tree;
    },

    loadData: function() {
        var me = this;
        // Пробуем разные комбинации параметров
        var testParams = [
            { vehs: 1, state: 1, objects: 1, units: 1 },
            { vehs: 1, state: 1, vehicles: 1, items: 1 },
            { cmd: 'getTree', withObjects: 1, withGroups: 1 },
            { vehs: 1, state: 1, full: 1 }
        ];

        // Для теста используем первый набор – наиболее вероятный
        var params = testParams[0];
        console.log('Отправляем запрос с параметрами:', params);

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: params,
            success: function(response) {
                var data;
                try { data = Ext.decode(response.responseText); } catch(e) {
                    console.error('Ошибка парсинга JSON', response.responseText);
                    return;
                }
                console.log('ПОЛНЫЙ ОТВЕТ СЕРВЕРА:', JSON.parse(JSON.stringify(data))); // глубокое копирование

                var root = me.store.getRootNode();
                root.removeAll();
                if (data && data.length > 0) {
                    me.addNodes(root, data);
                    root.expandChildren(true, false);
                } else if (data && data.data) {
                    me.addNodes(root, data.data);
                } else {
                    Ext.Msg.alert('Внимание', 'Данные не получены. Проверьте консоль для отладки.');
                }
            },
            failure: function() { Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные'); }
        });
    },

    addNodes: function(parent, nodes) {
        if (!Ext.isArray(nodes)) nodes = [nodes];
        var me = this;
        Ext.each(nodes, function(node) {
            // Определяем название
            var nodeText = node.text || node.name || node.title || (node.id ? 'ID ' + node.id : '?');
            var isLeaf = !node.children || node.children.length === 0;
            var newNode = parent.appendChild({
                text: nodeText,
                leaf: isLeaf,
                state: node.state,
                speed: node.speed,
                last_update: node.last_update,
                equip_type: node.equip_type,
                id: node.id
            });
            if (node.children && node.children.length) {
                me.addNodes(newNode, node.children);
            }
        });
    }
});
