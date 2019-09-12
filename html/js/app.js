$(function() { 
  var restPath =  '../scripts/metrics.js/';
  var dataURL = restPath + 'trend/json';
  var topologyURL = restPath + 'topology/json';
  var topologyInfoURL = restPath + 'topology/info/json';
  var membersURL = restPath + 'members/json';
  var membersInfoURL = restPath + 'members/info/json';
  var linksURL = restPath + 'links/json';
  var nodesURL = restPath + 'nodes/json';
  var locationsURL = restPath + 'locations/json';
  var SEP = '_SEP_';

  var defaults = {
    tab:0,
    traffic0:'show',
    traffic1:'show',
    traffic2:'hide',
    traffic3:'hide',
    ports0:'show',
    ports1:'show',
    ports2:'show',
    swishow:25,
    lnkshow:25,
    locshow:25,
    hlp0:'hide',
    hlp1:'hide',
    hlp2:'hide',
    hlp3:'hide',
    hlp4:'hide',
    hlp5:'hide',
    hlp6:'hide',
    hlp7:'hide',
    hlp8:'hide',
    hlp9:'hide',
    hlp10:'hide',
    hlp11:'hide'
  };

  var state = {};
  $.extend(state,defaults);

  function nf(value,fix) {
    var suffixes = ["\u00B5", "m", "", "K", "M", "G", "T", "P", "E"];
    if (value === 0) return value;
    var i = 2;
    var divisor = 1;
    var factor = 1000;
    var absVal, scaled;
    absVal = Math.abs(value);
    while (i < suffixes.length) {
      if ((absVal / divisor) < factor) break;
      divisor *= factor;
      i++;
    }
    scaled = Math.round(absVal * factor / divisor) / factor;
    if(fix) scaled = scaled.toFixed(fix);
    return scaled + suffixes[i];
  };

  function createQuery(params) {
    var query, key, value;
    for(key in params) {
      value = params[key];
      if(value == defaults[key]) continue;
      if(query) query += '&';
      else query = '';
      query += encodeURIComponent(key)+'='+encodeURIComponent(value);
    }
    return query;
  }

  function getState(key, defVal) {
    return window.sessionStorage.getItem('ix_'+key) || state[key] || defVal;
  }

  function setState(key, val, showQuery) {
    state[key] = val;
    window.sessionStorage.setItem('ix_'+key, val);
    if(showQuery) {
      var query = createQuery(state);
      window.history.replaceState({},'',query ? '?' + query : './');
    }
  }

  function setQueryParams(query) {
    var vars, params, i, pair;
    vars = query.split('&');
    params = {};
    for(i = 0; i < vars.length; i++) {
      pair = vars[i].split('=');
      if(pair.length == 2) setState(decodeURIComponent(pair[0]), decodeURIComponent(pair[1]),false);
    }
  }

  var search = window.location.search;
  if(search) setQueryParams(search.substring(1));

  $('#clone_button').button({icons:{primary:'ui-icon-newwin'},text:false}).click(function() {
    window.open(window.location);
  });

  $('#traffic-acc > div').each(function(idx) {
    $(this).accordion({
      heightStyle:'content',
      collapsible: true,
      active: getState('traffic'+idx, 'hide') == 'show' ? 0 : false,
      activate: function(event, ui) {
        var newIndex = $(this).accordion('option','active');
        setState('traffic'+idx, newIndex === 0 ? 'show' : 'hide', true);
        $.event.trigger({type:'updateChart'});
      }
    });
  });

  $('#ports-acc > div').each(function(idx) {
    $(this).accordion({
      heightStyle:'content',
      collapsible: true,
      active: getState('ports'+idx, 'hide') == 'show' ? 0 : false,
      activate: function(event, ui) {
        var newIndex = $(this).accordion('option','active');
        setState('ports'+idx, newIndex === 0 ? 'show' : 'hide', true);
        $.event.trigger({type:'updateChart'});
      }
    });
  });

  $('#help-acc > div').each(function(idx) {
    $(this).accordion({
      heightStyle:'content',
      collapsible: true,
      active: getState('hlp'+idx, 'hide') == 'show' ? 0 : false,
      activate: function(event, ui) {
        var newIndex = $(this).accordion('option','active');
        setState('hlp'+idx, newIndex === 0 ? 'show' : 'hide', true);
      }
    });
  });

  $('#tabs').tabs({
    active: getState('tab', 0),
    activate: function(event, ui) {
      var newIndex = ui.newTab.index();
      setState('tab', newIndex, true);
      $.event.trigger({type:'updateChart'});
    },
    create: function(event,ui) {
      $.event.trigger({type:'updateChart'});
    }
  }); 

  function initializeLocationsTable() {
  var $edgeTable = $('#locationstable').DataTable({
    ajax:{
      url: locationsURL,
      dataSrc: function(data) {
        // update summary counts
        var sumLocs = 0;
        if(data && data.length) {
          sumLocs = data.length;
        }
        $('#locationcount').val(sumLocs);
        return data;
      }
    },
    deferRenderer: true,
    columns:[
      {data:'node'},
      {data:'port'},
      {data:'vlan'},
      {data:'member'},
      {data:'mac'},
      {data:'ouiname'}
      ]
    })
    .page.len(getState('locshow'))
    .on('length', function(e,settings,len) {
      setState('locshow', len, true);
    });
    $('#refreshlocations').button({icons:{primary:'ui-icon-arrowrefresh-1-e'},text:false}).click(function() { $edgeTable.ajax.reload();})
  }

  var db = {};
  var ethtypes = {'2048':'IPv4', '2054':'ARP', '34525':'IPv6'};
  function printEthType(k,i) { return ethtypes[k] || '0x'+(parseInt(k).toString(16)) };
  $('#utilizationin').chart({
    type: 'topn',
    metric: 'top-5-inutilization',
    legendHeadings:['Switch','Ingress Port'],
    stack: false,
    includeOther:false,
    sep: SEP,
    units: '% Utilization'},
  db);
  $('#utilizationout').chart({
    type: 'topn',
    metric: 'top-5-oututilization',
    legendHeadings:['Switch','Egress Port'],
    stack: false,
    includeOther:false,
    sep: SEP,
    units: '% Utilization'},
  db);
  $('#discardsin').chart({
    type: 'topn',
    metric: 'top-5-indiscards',
    legendHeadings:['Switch','Ingress Port'],
    stack: false,
    includeOther:false,
    sep: SEP,
    units: 'Frames per Second'},
  db);
  $('#discardsout').chart({
    type: 'topn',
    metric: 'top-5-outdiscards',
    legendHeadings:['Switch','Egress Port'],
    stack: false,
    includeOther:false,
    sep: SEP,
    units: 'Frames per Second'},
  db);
  $('#errorsin').chart({
    type: 'topn',
    metric: 'top-5-inerrors',
    legendHeadings:['Switch','Ingress Port'],
    stack: false,
    includeOther:false,
    sep: SEP,
    units: 'Frames per Second'},
  db);
  $('#errorsout').chart({
    type: 'topn',
    metric: 'top-5-outerrors',
    legendHeadings:['Switch','Egress Port'],
    stack: false,
    includeOther:false,
    sep: SEP,
    units: 'Frames per Second'},
  db);
  $('#topsources').chart({
    type: 'topn',
    stack: true,
    includeOther: false,
    sep: SEP,
    metric: 'top-5-memsrc',
    legendHeadings: ['Src Member'],
    units: 'Bits per Second'},
  db);
  $('#topdestinations').chart({
    type: 'topn',
    stack: true,
    includeOther: false,
    sep: SEP,
    metric: 'top-5-memdst',
    legendHeadings: ['Dst Member'],
    units: 'Bits per Second'},
  db);
  $('#toppairs').chart({
    type: 'topn',
    stack: true,
    includeOther: false,
    sep: SEP,
    metric: 'top-5-mempair',
    legendHeadings: ['Src Member','Dst Member'],
    units: 'Bits per Second'},
  db); 
  $('#topprotos').chart({
    type: 'topn',
    stack: true,
    sep: SEP,
    metric: 'top-5-protocol',
    legendHeadings: ['Eth. Type'],
    keyName: printEthType,
    units: 'Bits per Second'},
  db);
  $('#topunknownsrc').chart({
    type: 'topn',
    stack: true,
    includeOther:false,
    sep: SEP,
    metric: 'top-5-memunknownsrc',
    legendHeadings: ['Src Mac'],
    units: 'Bits per Second'},
  db);
  $('#topunknowndst').chart({
    type: 'topn',
    stack: true,
    includeOther:false,
    sep: SEP,
    metric: 'top-5-memunknowndst',
    legendHeadings: ['Dst Mac'],
    units: 'Bits per Second'},
  db);
  $('#pktsizes').css('height',200).chart({
    type:'trend',
    metrics:['dist-0-63','dist-64','dist-65-127','dist-128-255','dist-256-511','dist-512-1023','dist-1024-1517','dist-1518','dist-1519-'],
    legend:['0-63','64','65-127','128-255','256-511','512-1023','1024-1517','1518','>1518'],
    stack:true,
    ymargin:0.05,
    units:'Percent'
    },
  db);

  function updateData(data) {
    if(!data 
      || !data.trend 
      || !data.trend.times 
      || data.trend.times.length == 0) return;

    if(db.trend) {
      // merge in new data
      var maxPoints = db.trend.maxPoints;
      var remove = db.trend.times.length > maxPoints ? db.trend.times.length - maxPoints : 0;
      db.trend.times = db.trend.times.concat(data.trend.times);
      if(remove) db.trend.times = db.trend.times.slice(remove);
      for(var name in db.trend.trends) {
        db.trend.trends[name] = db.trend.trends[name].concat(data.trend.trends[name]);
        if(remove) db.trend.trends[name] = db.trend.trends[name].slice(remove);
      }
    } else db.trend = data.trend;

    db.trend.start = new Date(db.trend.times[0]);
    db.trend.end = new Date(db.trend.times[db.trend.times.length - 1]);
  
    $.event.trigger({type:'updateChart'});
  }

  function pollTrends() {
    $.ajax({
      url: dataURL,
      data: db.trend && db.trend.end ? {after:db.trend.end.getTime()} : null,
      success: function(data) {
        updateData(data);
        setTimeout(pollTrends, 1000);
      },
      error: function(result,status,errorThrown) {
        setTimeout(pollTrends,5000);
      },
      timeout: 60000
    });
  };

  function refreshTopology() {
    $.ajax({
      url: topologyInfoURL,
      dataType: 'json',
      success: function(data) {
        $('#topologynodes').val(data.nodes).removeClass(data.nodes ? 'error' : 'good').addClass(data.nodes ? 'good' : 'error');
        $('#topologylinks').val(data.links).removeClass(data.links ? 'error' : 'good').addClass(data.links ? 'good' : 'error');
      }
    }); 
  }

  refreshTopology();

  function getTopology() {
    location.href = topologyURL;
  }
  
  $('#topologyrefresh').button({icons:{primary:'ui-icon-arrowrefresh-1-e'},text:false}).click(refreshTopology);
  $('#topologyget').button({icons:{primary:'ui-icon-search'},text:false}).click(getTopology);
  $('#topologyfile').hide().change(function(event) {
    var input = event.target;
    var reader = new FileReader();
    var $this = $(this);
    reader.onload = function(){
      var text = reader.result;
      $this.wrap('<form>').closest('form').get(0).reset();
      $this.unwrap();
      $.ajax({
        url:topologyURL,
        type: 'POST',
        contentType:'application/json',
        data:text,
        success:refreshTopology,
        error: function() { warningDialog('Badly formatted topology'); }
      });
    }
    reader.readAsText(input.files[0]);
  });
  $('#topologyset').button({icons:{primary:'ui-icon-arrowstop-1-n'},text:false}).click(function() {$('#topologyfile').click();});

  function escapeHTML(t) { return $('<div/>').text(t).html(); }
  function nodeDetails(data, nodeData) {
    if(!data || !nodeData) return;

    var details = '<div class="slider">';
           
    // node details
    details += '<table  cellpadding="5" cellspacing="0" border="0" class="nodeDetails"><tbody><tr>';
    if(data.node) {
      var loadAvg = '';
      if(data.node.hasOwnProperty('load_one') && data.node.hasOwnProperty('load_five') && data.node.hasOwnProperty('load_fifteen')) loadAvg = '' + data.node['load_one'].toFixed(2) + '/' + data.node['load_five'].toFixed(2) + '/' + data.node['load_fifteen'].toFixed(2);
      details += '<td>Load Avg:</td><td>' + loadAvg + '</td>';
      details += '<td>Agent:</td><td>' + nodeData['agent'] + '</td>';
      details += '<td>CPU:</td><td>' + (data.node['machine_type'] ? data.node['machine_type'] : '') + '</td>';
      details += '<td>Release:</td><td>' + (data.node['os_release'] ? escapeHTML(data.node['os_release']) : '') + '</td>';
      details += '</tr></tbody></table>';
    }
         
    // interface table
    if(data.ports && data.ports.length > 0) {       
      details += '<table cellpadding="5" cellspacing="0" border="0" class="portDetails">';
      details += '<thead><tr><th>Port</th><th>Speed</th><th>Status</th><th>Counters</th><th>Flows</th></tr></thead>';
      details += '<tbody>';
      for(var i = 0; i < data.ports.length; i++) {
        details += '<tr>';
        var port = data.ports[i];
        details += '<td>' + (port.name || '') + '</td>';
        details += '<td>' + (port.speed >= 0 ?  nf(port.speed) : '') + '</td>';
        details += '<td class="' + (port.status ? 'good' : 'warn') + '">' + (port.status ? "OK" : (port.counters ? "Down" : "Missing")) + '</td>';
        details += '<td class="' + (port.counters ? 'good' : 'warn') + '">' + (port.counters ? "OK" : "Missing") + '</td>';
        details += '<td class="' + (port.flows ? 'good' : 'warn') + '">' + (port.flows ? "OK" : "Missing") + '</td>';
        details += '</tr>';
      }
      details += '</tbody>';
      details += '</table>';
    }
    details += '</div>';
    return details;
  }

  function initializeNodesTable() {
    var $nodesTable = $('#nodestable').DataTable({
      ajax: {
        url:nodesURL,
        dataSrc: function(data) {
          // update summary counts
          var sumNodes = 0, sumUnlinked = 0, sumAdminDown = 0, sumOperDown = 0;
          if(data && data.length) {
            sumNodes = data.length;
            for(var i = 0; i < data.length; i++) {
              var node = data[i];
              if(node['link_count'] === 0) sumUnlinked++;
              sumAdminDown += node['admin_down'];
              sumOperDown += node['oper_down'];
            }
          }
          $('#nodecount').val(sumNodes);
          $('#nodesdisconnected').val(sumUnlinked).removeClass(sumUnlinked ? 'good' : 'error').addClass(sumUnlinked ? 'error' : 'good');
          $('#portsdown').val(sumOperDown);
          return data;
        }
      },
      deferRenderer:true,
      columns: [
        {
          "class": 'details-control',
          "orderable": false,
          "data": null,
          "defaultContent": ''
        },
        {data:'name'},
        {data:'cpu_utilization'},
        {data:'memory_utilization'},
        {data:'disk_utilization'},
        {data:'disk_part_utilization'},
        {data:'uptime'},
        {data:'link_count'},
        {data:'interfaces'},
        {data:'oper_down'}
      ],
      columnDefs: [
        {},
        {},
        { class: 'alignr', render: function(data, type, row) { return data === -1 ? '' : data.toFixed(2); }, targets:2},
        { class: 'alignr', render: function(data, type, row) { return data === -1 ? '' : data.toFixed(2); }, targets:3},      
        { class: 'alignr', render: function(data, type, row) { return data === -1 ? '' : data.toFixed(2); },  targets:4 },
        { class: 'alignr', render: function(data, type, row) { return data === -1 ? '' : data.toFixed(2); },  targets:5 },
        { class: 'alignr', render: function(data, type, row) { return data === -1 ? '' : (data /  86400).toFixed(2); },  targets:6 },
        { class: 'alignr', targets: 7},
        { class: 'alignr',targets: 8},
        { class: 'alignr',targets: 9}
      ],
      order: [[1, 'asc']],
      createdRow: function(row, data, index) {
        data['link_count'] ? $('td', row).eq(7).addClass('good') : $('td', row).eq(7).addClass('error');
      }
    })
    .page.len(getState('swishow'))
    .on('length', function(e,settings,len) {
      setState('swishow', len, true);
    })
    .on('click', 'td.details-control', function(e) {
      var tr = $(this).closest('tr');
      var row = $nodesTable.row(tr);
      if( row.child.isShown()) {
        $('div.slider', row.child()).slideUp( function() {
          row.child.hide();
          tr.removeClass('shown');
        });
      }
      else {
        // make a query for details on selected node
        var nodeData = row.data();
        $.ajax({
          url: restPath + 'node/' + encodeURIComponent(nodeData['name'] ) + '/json',
          data: {agent: nodeData['agent'] },
          success: function(data) {
            row.child(nodeDetails(data, nodeData),'no-padding').show();
            tr.addClass('shown');
            $('div.slider', row.child()).slideDown();
          }
        });
      }
    });
    $('#refreshnodes').button({icons:{primary:'ui-icon-arrowrefresh-1-e'},text:false}).click(function() { $nodesTable.ajax.reload(); });
  }

  function initializeLinksTable() { 
    var $linksTable = $('#linkstable').DataTable({
      ajax:{
        url: linksURL, 
        dataSrc: function(data) { 
          // update summary counts
          var sumLinks = 0, sumStatus = 0, sumCounters = 0, sumFlows = 0;
          if(data && data.length) {
            sumLinks = data.length;
            for(var i = 0; i < data.length; i++) {
              var link = data[i];
              if(!link.statusOK) sumStatus++;
              if(!link.countersOK) sumCounters++;
              if(!link.flowsOK) sumFlows++;
            }
          }
          $('#linkcount').val(sumLinks);
          $('#linkstatuscount').val(sumStatus).removeClass(sumStatus ? 'good' : 'error').addClass(sumStatus ? 'error' : 'good');
          $('#linkcounterscount').val(sumCounters).removeClass(sumCounters ? 'good' : 'error').addClass(sumCounters ? 'error' : 'good');
          $('#linkflowscount').val(sumFlows).removeClass(sumFlows ? 'good' : 'warn').addClass(sumFlows ? 'warn' : 'good');
          return data
        }
      },
      deferRenderer: true,
      columns:[
        {data:'name'},
        {data:'node1'},
        {data:'port1'},
        {data:'node2'},
        {data:'port2'},
        {data:'speed'},
        {data:'statusOK'},
        {data:'countersOK'},
        {data:'flowsOK'}
      ],
      columnDefs: [
        {},
        {},
        {},
        {},
        {},
        {},
        { render: function(data, type, row) { return data ? nf(data) : 'Unknown'; }, targets:5},
        { render: function(data,type,row) { return data ? 'OK' : row['countersOK'] ? 'Down' : 'Missing'}, targets:6},
        { render: function(data,type,row) { return data ? 'OK' : 'Missing'}, targets:7},
        { render: function(data,type,row) { return data ? 'OK' : 'Missing'}, targets:8}
      ],
      createdRow: function(row, data, index) {
        data['statusOK'] ? $('td', row).eq(6).addClass('good') : $('td', row).eq(6).addClass('error');
        data['countersOK'] ? $('td', row).eq(7).addClass('good') : $('td', row).eq(7).addClass('error');
        data['flowsOK'] ? $('td', row).eq(8).addClass('good') : $('td', row).eq(8).addClass('warn');
    }
  })
  .page.len(getState('lnkshow'))
  .on('length', function(e,settings,len) {
    setState('lnkshow', len, true);
  });
  $('#refreshlinks').button({icons:{primary:'ui-icon-arrowrefresh-1-e'},text:false}).click(function() { $linksTable.ajax.reload();});
  }

  function refreshMembers() {
    $.ajax({
      url: membersInfoURL,
      dataType: 'json',
      success: function(data) {
        $('#membernum').val(data.numMembers).removeClass(data.numMembers ? 'error' : 'good').addClass(data.numMembers ? 'good' : 'error');
        $('#macnum').val(data.numMacs).removeClass(data.numMacs ? 'error' : 'good').addClass(data.numMacs ? 'good' : 'error');
      }
    });
  }

  refreshMembers();

  function getMembers() {
    location.href = membersURL;
  }
 
  $('#membersrefresh').button({icons:{primary:'ui-icon-arrowrefresh-1-e'},text:false}).click(refreshMembers);
  $('#membersget').button({icons:{primary:'ui-icon-search'},text:false}).click(getMembers);
  $('#membersfile').hide().change(function(event) {
    var input = event.target;
    var reader = new FileReader();
    var $this = $(this);
    reader.onload = function(){
      var text = reader.result;
      $this.wrap('<form>').closest('form').get(0).reset();
      $this.unwrap();
      $.ajax({
        url:membersURL,
        type: 'POST',
        contentType:'application/json',
        data:text,
        success:refreshMembers,
        error: function() { warningDialog('Badly formatted members'); }
      });
    }
    reader.readAsText(input.files[0]);
  });
  $('#membersset').button({icons:{primary:'ui-icon-arrowstop-1-n'},text:false}).click(function() {$('#membersfile').click();});

  $(window).resize(function() {
    $.event.trigger({type:'updateChart'});
  });

  pollTrends();
  initializeNodesTable();
  initializeLinksTable();
  initializeLocationsTable();
});
