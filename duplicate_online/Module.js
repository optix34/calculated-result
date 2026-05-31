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
            width: 500, // шире, чтобы поместились колонки
            items: [{
                xtype: 'container',
                layout: 'vbox',
                flex: 1,
                items: [
                    me.buildFilterToolbar(),
                    me.buildOnlineTreeWithColumns()
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
                pressed: true,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 'all'); }
            }, {
                text: l('Активные'),
                stateValue: 1,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 1); }
            }, {
                text: l('Аварии'),
                stateValue: 2,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 2); }
            }, {
                text: l('Стоянка'),
                stateValue: 3,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 3); }
            }, {
                text: l('Холостой ход'),
                stateValue: 4,
                enableToggle: true,
                toggleGroup: 'statefilter',
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
        me.filterButtons = filterBar.items.items.slice(0, 5);
        return filterBar;
    },

    // Дерево объектов с колонками (полный список ТС клиента)
    buildOnlineTreeWithColumns: function() {
        var me = this;

        // Определение колонок (как в оригинальной вкладке Онлайн)
        var columns = [{
            xtype: 'treecolumn',
            text: l('Объекты'),
            dataIndex: 'text',
            flex: 2,
            sortable: false
        }, {
            text: l('Статус'),
            dataIndex: 'state',
            width: 100,
            align: 'center',
            renderer: function(value, meta, record) {
                if (!record.isLeaf()) return '';
                var statusText = '';
                var iconCls = '';
                switch (value) {
                    case 1: statusText = l('Активен'); iconCls = 'fa fa-play-circle'; break;
                    case 2: statusText = l('Авария'); iconCls = 'fa fa-exclamation-triangle'; break;
                    case 3: statusText = l('Стоянка'); iconCls = 'fa fa-pause-circle'; break;
                    case 4: statusText = l('Холостой ход'); iconCls = 'fa fa-hourglass-half'; break;
                    default: statusText = l('Неизвестно'); iconCls = 'fa fa-question-circle';
                }
                return '<i class="' + iconCls + '" style="margin-right:5px;"></i>' + statusText;
            }
        }, {
            text: l('Обновлено'),
            dataIndex: 'last_update',
            width: 150,
            renderer: function(value) {
                if (!value) return '—';
                // Предполагаем, что значение — timestamp или строка даты
                return Ext.Date.format(new Date(value * 1000), 'd.m.Y H:i:s');
            }
        }, {
            text: l('Тип оборудования'),
            dataIndex: 'equip_type',
            width: 120,
            renderer: function(value) {
                return value || '—';
            }
        }, {
            text: l('Скорость'),
            dataIndex: 'speed',
            width: 70,
            align: 'right',
            renderer: function(value, meta, record) {
                if (!record.isLeaf() || !value) return '—';
                return value + ' ' + (window.uom ? window.uom.speed : 'км/ч');
            }
        }];

        // Хранилище дерева
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: {
                    type: 'json',
                    rootProperty: ''    // ответ — массив
                }
            },
            listeners: {
                load: function(store, node, records) {
                    // После загрузки применяем поиск (если есть)
                    me.applySearchFilter(me.searchField && me.searchField.getValue());
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
            columns: columns,
            hideHeaders: false,
            viewConfig: {
                loadMask: true,
                stripeRows: true
            }
        });

        // Сохраняем ссылку на поле поиска (находим его в тулбаре)
        me.searchField = Ext.ComponentQuery.query('textfield', me.tree.up())[0];
        return me.tree;
    },

    // Фильтрация по состоянию (state) через перезагрузку дерева
    filterByState: function(btn, stateValue) {
        var me = this;
        var store = me.treeStore;
        if (!store) return;

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
            if (node.data.hiddenBySearch) {
                node.set('visible', true);
                delete node.data.hiddenBySearch;
            }
        });

        if (!query || query.length < 2) {
            return;
        }

        var lowerQuery = query.toLowerCase();
        // Сначала скрываем все узлы, кроме корня
        root.cascadeBy(function(node) {
            if (node !== root) {
                node.set('visible', false);
                node.data.hiddenBySearch = true;
            }
        });

        // Показываем узлы, у которых текст содержит подстроку, и всех их предков
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = node.get('text') || node.get('name') || '';
                if (text.toLowerCase().indexOf(lowerQuery) !== -1) {
                    node.set('visible', true);
                    delete node.data.hiddenBySearch;
                    var parent = node.parentNode;
                    while (parent && parent !== root) {
                        parent.set('visible', true);
                        delete parent.data.hiddenBySearch;
                        parent = parent.parentNode;
                    }
                }
            }
        });
    }
});
