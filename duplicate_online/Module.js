Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // 1. Левая панель (вкладка) – используется стандартный Ext.panel.Panel
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 750,
            layout: 'vbox',
            border: true,
            items: [
                me.buildToolbar(),   // тулбар с кнопками и поиском
                me.buildTree()       // дерево с колонками
            ]
        });

        // 2. Правая панель – разделена по горизонтали на две пустые области
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>'
            }]
        });

        // 3. Связываем левую вкладку с правой панелью (обязательно)
        navTab.map_frame = mainPanel;

        // 4. Добавляем в интерфейс PILOT
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    // Тулбар с кнопками фильтрации по состоянию и полем поиска
    buildToolbar: function() {
        var me = this;
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: 'Все',
                stateValue: 'all',
                enableToggle: true,
                toggleGroup: 'statefilter',
                pressed: true,
                handler: function(btn) { me.filterByState(btn, 'all'); }
            }, {
                text: 'Активные',
                stateValue: 1,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 1); }
            }, {
                text: 'Аварии',
                stateValue: 2,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 2); }
            }, {
                text: 'Стоянка',
                stateValue: 3,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 3); }
            }, {
                text: 'Холостой ход',
                stateValue: 4,
                enableToggle: true,
                toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 4); }
            }, '->', {
                xtype: 'textfield',
                emptyText: 'Поиск...',
                enableKeyEvents: true,
                listeners: {
                    keyup: function(field) {
                        me.applySearchFilter(field.getValue());
                    }
                }
            }]
        });
        me.searchField = toolbar.items.last();
        return toolbar;
    },

    // Дерево с колонками
    buildTree: function() {
        var me = this;

        // Хранилище дерева (TreeStore) с прокси на /ax/tree.php
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: { type: 'json', rootProperty: '' }
            }
        });

        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.treeStore,
            rootVisible: false,
            useArrows: true,
            lines: true,
            columns: [{
                xtype: 'treecolumn',
                text: 'Объекты',
                dataIndex: 'text',
                flex: 2,
                renderer: function(v, m, rec) {
                    return v || rec.get('name') || rec.get('id') || '—';
                }
            }, {
                text: 'Статус',
                dataIndex: 'state',
                width: 110,
                renderer: function(v, m, rec) {
                    if (!rec.isLeaf()) return '';
                    switch(v) {
                        case 1: return '<span style="color:green;">● Активен</span>';
                        case 2: return '<span style="color:red;">⚠ Авария</span>';
                        case 3: return '<span style="color:orange;">⏸ Стоянка</span>';
                        case 4: return '<span style="color:gray;">⏳ Холостой ход</span>';
                        default: return '—';
                    }
                }
            }, {
                text: 'Обновлено',
                dataIndex: 'last_update',
                width: 140,
                renderer: function(v) {
                    if (!v) return '—';
                    if (typeof v === 'number') return Ext.Date.format(new Date(v * 1000), 'd.m.Y H:i:s');
                    return v;
                }
            }, {
                text: 'Тип оборудования',
                dataIndex: 'equip_type',
                width: 120,
                renderer: function(v) { return v || '—'; }
            }, {
                text: 'Скорость',
                dataIndex: 'speed',
                width: 90,
                renderer: function(v, m, rec) {
                    if (!rec.isLeaf() || v === undefined) return '—';
                    return v + ' км/ч';
                }
            }],
            viewConfig: { stripeRows: true, loadMask: true, emptyText: 'Загрузка данных...' }
        });

        return me.tree;
    },

    // Фильтрация по состоянию (перезагрузка дерева с новым параметром state)
    filterByState: function(btn, stateValue) {
        var me = this;
        var proxy = me.treeStore.getProxy();
        if (stateValue === 'all') {
            proxy.setExtraParam('state', 1);
        } else {
            proxy.setExtraParam('state', stateValue);
        }
        me.treeStore.load();
    },

    // Клиентский поиск по названию
    applySearchFilter: function(query) {
        var root = this.treeStore.getRootNode();
        if (!root) return;

        root.cascadeBy(function(node) { node.set('visible', true); });
        if (!query || query.length < 2) return;

        var lower = query.toLowerCase();
        root.cascadeBy(function(node) { if (node !== root) node.set('visible', false); });
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = (node.get('text') || node.get('name') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
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
