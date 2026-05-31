Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // 1. Левая панель (дубликат Онлайн) с использованием фирменного компонента
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            iconAlign: 'top',
            minimized: true,
            width: 320,
            items: [{
                xtype: 'container',
                layout: 'vbox',
                flex: 1,
                items: [
                    me.buildFilterToolbar(),
                    me.buildOnlineTree()
                ]
            }]
        });

        // 2. Правая панель (разделена по горизонтали на две пустые области)
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Верхняя панель (пусто)</div>',
                cls: 'x-panel-default-framed'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>',
                cls: 'x-panel-default-framed'
            }]
        });

        // Связываем левую вкладку с правой областью
        navTab.map_frame = mainPanel;

        // Добавляем в интерфейс PILOT
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);
    },

    // Панель кнопок фильтрации по состоянию (как в оригинале "Онлайн")
    buildFilterToolbar: function() {
        var me = this;
        var filterBar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: l('Все'),
                stateValue: 'all',
                handler: function(btn) { me.filterByState(btn, 'all'); }
            }, {
                text: l('Активные'),
                stateValue: 1,
                handler: function(btn) { me.filterByState(btn, 1); }
            }, {
                text: l('Аварии'),
                stateValue: 2,
                handler: function(btn) { me.filterByState(btn, 2); }
            }, {
                text: l('Стоянка'),
                stateValue: 3,
                handler: function(btn) { me.filterByState(btn, 3); }
            }, {
                text: l('Холостой ход'),
                stateValue: 4,
                handler: function(btn) { me.filterByState(btn, 4); }
            }, '->', {
                xtype: 'textfield',
                emptyText: l('Поиск...'),
                enableKeyEvents: true,
                listeners: {
                    keyup: function(field) {
                        me.applySearchFilter(field.getValue());
                    }
                }
            }]
        });

        me.filterButtons = filterBar.items.items.slice(0, 5); // сохраняем кнопки для стилизации
        return filterBar;
    },

    // Дерево объектов (полный список ТС клиента)
    buildOnlineTree: function() {
        var me = this;

        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: {
                expanded: true,
                children: []
            },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: {
                    vehs: 1,
                    state: 1   // по умолчанию "Все"
                },
                reader: {
                    type: 'json',
                    rootProperty: ''    // ответ — массив групп
                }
            },
            listeners: {
                load: function(store, node, records) {
                    me.applySearchFilter(me.searchField && me.searchField.getValue());
                },
                // Сохраняем исходную копию для клиентской фильтрации (если потребуется)
                beforeload: function() {
                    if (!me.originalRoot && me.treeStore.getRootNode().childNodes.length) {
                        me.originalRoot = me.treeStore.getRootNode().copy();
                    }
                }
            }
        });

        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.treeStore,
            rootVisible: false,
            useArrows: true,
            lines: true,
            border: false,
            hideHeaders: true,
            viewConfig: {
                loadMask: true,
                stripeRows: true
            }
        });

        // Сохраняем ссылку на поле поиска
        me.searchField = Ext.ComponentQuery.query('textfield', me.tree.up())[0];
        return me.tree;
    },

    // Фильтрация по состоянию (state) через перезагрузку дерева
    filterByState: function(btn, stateValue) {
        var me = this;
        var store = me.treeStore;
        if (!store) return;

        // Активная кнопка (визуальное выделение)
        Ext.each(me.filterButtons, function(b) {
            if (b === btn) b.addCls('x-btn-pressed');
            else b.removeCls('x-btn-pressed');
        });

        // Устанавливаем параметр state в запросе
        if (stateValue === 'all') {
            store.getProxy().setExtraParam('state', 1);
        } else {
            store.getProxy().setExtraParam('state', stateValue);
        }

        // Перезагружаем дерево
        store.load({
            callback: function() {
                me.applySearchFilter(me.searchField && me.searchField.getValue());
            }
        });
    },

    // Клиентский поиск по имени узла (регистронезависимый)
    applySearchFilter: function(query) {
        var me = this;
        var store = me.treeStore;
        if (!store) return;

        var root = store.getRootNode();
        if (!root) return;

        // Сбрасываем предыдущую фильтрацию поиска (показываем всё, что прошло фильтр по состоянию)
        root.cascadeBy(function(node) {
            if (node.data.visible === false) {
                // Если узел был скрыт поиском, возвращаем видимость в исходное состояние
                node.set('visible', true);
            }
        });

        if (!query || query.length < 2) {
            // Поиск не активен — ничего не скрываем
            return;
        }

        var lowerQuery = query.toLowerCase();
        // Сначала скрываем все узлы, кроме корня
        root.cascadeBy(function(node) {
            if (node !== root) node.set('visible', false);
        });

        // Показываем узлы, у которых текст содержит подстроку, и всех их предков
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = node.get('text') || node.get('name') || '';
                if (text.toLowerCase().indexOf(lowerQuery) !== -1) {
                    node.set('visible', true);
                    var parent = node.parentNode;
                    while (parent && parent !== root) {
                        parent.set('visible', true);
                        parent = parent.parentNode;
                    }
                }
            }
        });
    }
});
