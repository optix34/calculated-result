Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (вкладка) с гридом
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 950,
            layout: 'border',
            items: [{
                region: 'north',
                height: 40,
                items: [me.buildToolbar()]
            }, {
                region: 'center',
                items: [me.buildGrid()]
            }]
        });

        // Правая панель: карта сверху, пустая панель снизу
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel',
                flex: 1,
                layout: 'fit',
                html: '<div id="dup-online-map" style="width:100%;height:100%;"></div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        if (skeleton.navigation.setActiveTab) skeleton.navigation.setActiveTab(navTab);
        if (skeleton.mapframe) skeleton.mapframe.add(mainPanel);

        setTimeout(function() {
            skeleton.navigation.updateLayout();
            if (skeleton.mapframe) skeleton.mapframe.updateLayout();
            navTab.updateLayout();
        }, 100);

        setTimeout(function() { me.initMap(); }, 200);

        // Автообновление каждые 15 секунд
        me.startAutoRefresh();
    },

    startAutoRefresh: function() {
        var me = this;
        if (me.refreshInterval) clearInterval(me.refreshInterval);
        me.refreshInterval = setInterval(function() {
            if (me.gridStore) {
                me.loadCurrentData();
            }
        }, 15000);
    },

    buildToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: ['->', {
                xtype: 'textfield',
                emptyText: 'Поиск...',
                enableKeyEvents: true,
                width: 200,
                listeners: {
                    keyup: function(field) {
                        me.applySearchFilter(field.getValue());
                    }
                }
            }]
        });
    },

    buildGrid: function() {
        var me = this;
        me.gridStore = Ext.create('Ext.data.Store', {
            fields: [
                'vehid', 'name', 'active', 'on', 'last_connection', 'last_data',
                'configuration', 'uniqid', 'typename', 'info', 'model', 'year'
            ],
            data: []
        });

        me.grid = Ext.create('Ext.grid.Panel', {
            store: me.gridStore,
            columns: [{
                text: 'Объекты',
                dataIndex: 'name',
                flex: 2,
                renderer: function(v) { return v || '—'; }
            }, {
                text: 'Статус',
                dataIndex: 'active',
                width: 100,
                renderer: function(v, meta, record) {
                    var active = record.get('active');
                    var on = record.get('on');
                    if (active === 1 && on === 1) return '<span style="color:green;">● Активен</span>';
                    if (active === 1 && on === 0) return '<span style="color:orange;">⏸ Офлайн</span>';
                    if (active === 0) return '<span style="color:gray;">◯ Неактивен</span>';
                    return '—';
                }
            }, {
                text: 'Обновление',
                dataIndex: 'last_connection',
                width: 140,
                renderer: function(v, meta, record) {
                    var last = v || record.get('last_data');
                    if (!last) return '—';
                    var ts = (typeof last === 'number') ? last : parseInt(last);
                    if (isNaN(ts)) return last;
                    if (ts > 10000000000) ts = ts / 1000;
                    return Ext.Date.format(new Date(ts * 1000), 'd.m.Y H:i:s');
                }
            }, {
                text: 'Тип оборудования',
                dataIndex: 'configuration',
                width: 100,
                renderer: function(v) { return v || '—'; }
            }, {
                text: 'IMEI',
                dataIndex: 'uniqid',
                width: 150,
                renderer: function(v) { return v || '—'; }
            }],
            viewConfig: { stripeRows: true, loadMask: true, emptyText: 'Загрузка данных...' }
        });

        // Загружаем данные
        me.loadCurrentData();
        return me.grid;
    },

    loadCurrentData: function() {
        var me = this;
        var currentTimestamp = Math.floor(Date.now() / 1000);

        Ext.Ajax.request({
            url: '/backend/ax/current_data.php',
            method: 'POST',
            params: {
                vehs: 1,
                state: 1,
                page: 1,
                start: 0,
                limit: 500,           // загружаем все объекты (без пагинации)
                unixTimestamp: currentTimestamp,
                user_id: 0,
                c: 6,                 // эти параметры можно подстроить, если нужно
                n: ''
            },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                console.log('Данные current_data.php:', data);
                if (data && data.data && Ext.isArray(data.data)) {
                    me.gridStore.loadData(data.data);
                } else if (Ext.isArray(data)) {
                    me.gridStore.loadData(data);
                } else {
                    me.gridStore.loadData([]);
                    me.grid.view.emptyText = 'Нет данных';
                }
                // Применяем поиск, если есть
                if (me.searchField && me.searchField.getValue()) {
                    me.applySearchFilter(me.searchField.getValue());
                }
            },
            failure: function() {
                me.gridStore.loadData([]);
                me.grid.view.emptyText = 'Ошибка загрузки данных';
                console.error('Ошибка запроса current_data.php');
            }
        });
    },

    applySearchFilter: function(query) {
        var me = this;
        if (!me.gridStore) return;
        if (!query || query.length < 2) {
            me.gridStore.clearFilter();
            return;
        }
        var lowerQuery = query.toLowerCase();
        me.gridStore.filterBy(function(record) {
            var name = record.get('name') || '';
            return name.toLowerCase().indexOf(lowerQuery) !== -1;
        });
    },

    initMap: function() {
        var container = document.getElementById('dup-online-map');
        if (!container) return;
        if (window.MapContainer) {
            this.map = new MapContainer('dup_map');
            this.map.init(55.75, 37.65, 10, 'dup-online-map', false);
        } else if (typeof L !== 'undefined') {
            this.map = L.map('dup-online-map').setView([55.75, 37.65], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        } else {
            container.innerHTML = '<div style="padding:20px;">Карта не доступна</div>';
        }
    }
});
