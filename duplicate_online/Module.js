Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (без зависимости от Pilot.utils.LeftBarPanel)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 700,
            layout: 'vbox',
            border: true,
            items: [
                me.buildFilterToolbar(),
                me.buildOnlineTree()
            ]
        });

        // Правая панель – разделена по горизонтали
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

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    // Панель кнопок фильтрации
    buildFilterToolbar: function() {
        var me = this;
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: l('Все'),
                stateValue: 'all',
                enableToggle: true,
                toggleGroup: 'statefilter',
                pressed: true,
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
        me.searchField = toolbar.items.last();
        return toolbar;
    },

    // Дерево объектов с колонками
    buildOnlineTree: function() {
        var me = this;

        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: {
                    type: 'json',
                    rootProperty: ''
                }
            }
        });

        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.treeStore,
            rootVisible: false,
            useArrows: true,
            lines: true,
            border: true,
            columns: [{
                xtype: 'treecolumn',
                text: l('Объекты'),
                dataIndex: 'text',
                flex: 2
            }, {
                text: l('Статус'),
                dataIndex: 'state',
                width: 110,
                renderer: function(value, meta, record) {
                    if (!record.isLeaf()) return '';
                    switch(value) {
                        case 1: return '<i class="fa fa-play-circle" style="color:green;"></i> ' + l('Активен');
                        case 2: return '<i class="fa fa-exclamation-triangle" style="color:red;"></i> ' + l('Авария');
                        case 3: return '<i class="fa fa-pause-circle" style="color:orange;"></i> ' + l('Стоянка');
                        case 4: return '<i class="fa fa-hourglass-half" style="color:gray;"></i> ' + l('Холостой ход');
                        default: return l('Неизвестно');
                    }
                }
            }, {
                text: l('Обновлено'),
                dataIndex: 'last_update',
                width: 140,
                renderer: function(value) {
                    if (!value) return '—';
                    if (typeof value === 'number') return Ext.Date.format(new Date(value * 1000), 'd.m.Y H:i:s');
                    return value;
                }
            }, {
                text: l('Тип оборудования'),
                dataIndex: 'equip_type',
                width: 120,
                renderer: function(v) { return v || '—'; }
            }, {
                text: l('Скорость'),
                dataIndex: 'speed',
                width: 90,
                renderer: function(v, m, r) {
                    if (!r.isLeaf() || v === undefined) return '—';
                    return v + ' ' + (window.uom ? window.uom.speed : 'км/ч');
                }
            }],
            viewConfig: { stripeRows: true, loadMask: true }
        });

        return me.tree;
    },

    // Фильтрация по состоянию (перезагрузка дерева)
    filterByState: function(btn, stateValue) {
        var me = this;
        var store = me.treeStore;
        if (!store) return;

        if (stateValue === 'all') {
            store.getProxy().setExtraParam('state', 1);
        } else {
            store.getProxy().setExtraParam('state', stateValue);
        }
        store.load({
            callback: function() {
                me.applySearchFilter(me.searchField.getValue());
            }
        });
    },

    // Поиск по названию
    applySearchFilter: function(query) {
        var me = this;
        var store = me.treeStore;
        if (!store) return;
        var root = store.getRootNode();
        if (!root) return;

        // Сброс
        root.cascadeBy(function(node) {
            node.set('visible', true);
        });

        if (!query || query.length < 2) return;

        var lowerQuery = query.toLowerCase();
        // Скрыть все
        root.cascadeBy(function(node) {
            if (node !== root) node.set('visible', false);
        });
        // Показать совпадающие
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = node.get('text') || '';
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
