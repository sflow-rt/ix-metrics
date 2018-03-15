// author: InMon Corp.
// version: 0.3
// date: 4/3/2016
// description: sFlow-RT IX Metrics
// copyright: Copyright (c) 2015,2016 InMon Corp.

// TODO:
// 1. verify that observed VLAN matches vlan_id in members file
// 2. link metrics to influxDB
// 3. port metrics to influxDB

include(scriptdir() + '/inc/trend.js');

var influxHost = getSystemProperty("ix.influx.host");
var influxDB = getSystemProperty("ix.influx.db") || "ix";
var influxURL = influxHost ? "http://"+influxHost+":8086/write?db="+influxDB : null;

var syslogHost = getSystemProperty("ix.syslog.host");
var syslogPort = getSystemProperty("ix.syslog.port") || 514;
var facility = 16; // local0
var severity = 5;  // notice

function sendWarning(msg) {
  if(syslogHost) syslog(syslogHost,syslogPort,facility,severity,msg);
  else logWarning(JSON.stringify(msg));
}

var topology = storeGet('topology');
if(topology) setTopology(topology);

var members = storeGet('members') || {};

var macToMember = {};
var ipGroups = {};
var numMembers = 0;
var numMacs = 0;
function updateMemberInfo() {
  var memberToMac,memberToIP,member,name,macs,ips,conns,j,conn,vlan_list,k,vlan,mac;
  if(!members.version) return;
  if(!(members.version === "0.4" || members.version === "0.5")) return;
  if(!members.member_list) return;

  memberToMac = {};
  memberToIP = {};
  macToMember = {};
  numMembers = 0;
  numMacs = 0;
  for(i = 0; i < members.member_list.length; i++) {
    member = members.member_list[i];
    if(!member) continue;
    name = member.name;
    if(!name) continue;
    numMembers++;
    macs = [];
    ips = [];
    conns = member.connection_list;
    if(!conns) continue;
    for(j = 0; j < conns.length; j++) {
      conn = conns[j];
      vlan_list = conn.vlan_list;
      if(!vlan_list) continue;
      for(var k = 0; k < vlan_list.length; k++) {
        vlan = vlan_list[k];
        if(!vlan) continue;
        if(vlan.ipv4 && vlan.ipv4.address) ips.push(vlan.ipv4.address);
        if(vlan.ipv6 && vlan.ipv6.address) ips.push(vlan.ipv6.address);
        mac = vlan.mac_address;
        if(!mac) continue;
        mac = mac.replace(/:/g,'').toUpperCase();
        if('UNKNOWN' === mac) continue;
        macs.push(mac);
        macToMember[mac] = name;
        numMacs++;
      }
    }
    if(ips.length > 0) memberToIP[name] = ips;
    if(macs.length > 0) memberToMac[name] = macs;
  }
  setGroups('ix_member',memberToIP);
  setMap('ix_member',memberToMac);
}
updateMemberInfo();

var trend = new Trend(300,1);
var points;

var SEP = '_SEP_';
var T = 15;
var N = 10;

// metrics
setFlow('ix_bytes', {value:'bytes', t:T, fs: SEP, filter:'direction=ingress'});
setFlow('ix_frames', {value:'frames', t:T, fs:SEP, filter:'direction=ingress'});
setFlow('ix_src', {keys:'map:macsource:ix_member', value:'bytes', n:N, t:T, fs:SEP, filter:'direction=ingress'});
setFlow('ix_dst', {keys:'map:macdestination:ix_member', value:'bytes', n:N, t:T, fs:SEP, filter:'direction=ingress'});
setFlow('ix_pair', {keys:'map:macsource:ix_member,map:macdestination:ix_member', value:'bytes', n:20, t:T, fs:SEP, filter:'direction=ingress'});
setFlow('ix_protocol', {keys:'ethernetprotocol', value:'bytes', n:N, t:T, fs:SEP, filter:'direction=ingress'}); 
setFlow('ix_pktsize', {keys:'range:bytes:0:63,range:bytes:64:64,range:bytes:65:127,range:bytes:128:255,range:bytes:256:511,range:bytes:512:1023,range:bytes:1024:1517,range:bytes:1518:1518,range:bytes:1519', value:'frames', n:9, t:T, filter:'direction=ingress'});

// find member macs
setFlow('ix_ip4', {keys:'macsource,group:ipsource:ix_member',value:'bytes',log:true,flowStart:true, n:N, t:T, fs:SEP});
setFlow('ix_ip6', {keys:'macsource,group:ip6source:ix_member',value:'bytes',log:true,flowStart:true, n:N, t:T, fs:SEP});

// find BGP connections
setFlow('ix_bgp', {keys:'or:[map:macsource:ix_member]:[group:ipsource:ix_member]:[group:ip6source:ix_member],or:[map:macdestination:ix_member]:[group:ipdestination:ix_member]:[group:ip6destination:ix_member]',value:'frames',filter:'tcpsourceport=179|tcpdestinationport=179',log:true,flowStart:true, n:N, t:T, fs:SEP});

// exceptions
setFlow('ix_srcmacunknown', {keys:'macsource', value:'bytes', filter:'direction=ingress&map:macsource:ix_member=null', n:N, t:T, fs:SEP});
setFlow('ix_dstmacunknown', {keys:'macdestination', value:'bytes', filter:'direction=ingress&map:macdestination:ix_member=null', n:N, t:T, fs:SEP});
setFlow('ix_badprotocol', {keys:'macsource,ethernetprotocol', value:'frames', filter:'ethernetprotocol!=2048,2054,34525', n:N, t:T, fs:SEP, log:true, flowStart:true});

var other = '-other-';
function calculateTopN(metric,n,minVal,total_bps) {     
  var total, top, topN, i, bps;
  top = activeFlows('TOPOLOGY',metric,n,minVal,'edge');
  var topN = {};
  if(top) {
    total = 0;
    for(i in top) {
      bps = top[i].value * 8;
      topN[top[i].key] = bps;
      total += bps;
    }
    if(total_bps > total) topN[other] = total_bps - total;
  }
  return topN;
}

function calculateTopInterface(metric,n) {
  var top = table('TOPOLOGY','sort:'+metric+':-'+n);
  var topN = {};
  if(top) {
    for(var i = 0; i < top.length; i++) {
      var val = top[i][0];
      var port = topologyInterfaceToPort(val.agent,val.dataSource);
      if(port && port.node && port.port) {
        topN[port.node + SEP + port.port] = val.metricValue; 
      }
    }
  }
  return topN; 
}

function getMetric(res, idx, defVal) {
  var val = defVal;
  if(res && res.length && res.length > idx && res[idx].hasOwnProperty('metricValue')) val = res[idx].metricValue;
  return val;
}

function flowCount(flow) {
  var res = activeFlows('TOPOLOGY',flow,1,0,'edge');
  return res && res.length > 0 ? res[0].value : 0;
}

var bgp = {};
var bgpLastSweep = 0;
var bgpSweepInterval = 60 * 60 * 1000;
var bgpAgingMs = 7 * 24 * 60 * 60 * 1000;
function ageBGP(now) {
  if(now - bgpLastSweep < bgpSweepInterval) return;
  bgpLastSweep = now;

  for(var key in bgp) {
    if(now - bgp[key] > bgpAgingMs) {
      delete bgp[key];
    }
  }
}

function influxEscape(str) {
  return str.replace(/[ ,\\]/g,function(c) { return '\\'+c; });
}

function updateInfluxDB() {
  if(!influxURL) return;

  var body = [];

  // Member traffic matrix
  // each metric is of form:
  // peering_bps,src=mac,dst=mac value=bps
  var res = activeFlows('TOPOLOGY','ix_pair',1000,0,'edge');
  if(!res) return;
  for(var i = 0; i < res.length; i++) {
    let [src,dst] = res[i].key.split(SEP);
    src = influxEscape(src);
    dst = influxEscape(dst);
    body.push('peering_bps,src='+src+',dst='+dst+' value='+(res[i].value*8));
  }

  // Protocols
  // each metric is of form:
  // bps,ethtype=type value=bps
  var prots = points['top-5-protocol'];
  body.push('bps,ethtype=IPv4 value='+(prots['2048'] || 0));
  body.push('bps,ethtype=IPv6 value='+(prots['34525'] || 0));
  body.push('bps,ethtype=ARP value='+(prots['2054'] || 0));

  // Packet size distribution
  // each metric is of form:
  // pktdist,size=range value=percent
  body.push('pktdist,size=0-63 value='+points['dist-0-63']);
  body.push('pktdist,size=64 value='+points['dist-64']);
  body.push('pktdist,size=65-127 value='+points['dist-65-127']);
  body.push('pktdist,size=128-255 value='+points['dist-128-255']);
  body.push('pktdist,size=256-511 value='+points['dist-256-511']);
  body.push('pktdist,size=512-1023 value='+points['dist-512-1023']);
  body.push('pktdist,size=1024-1517 value='+points['dist-1024-1517']);
  body.push('pktdist,size=1518 value='+points['dist-1518']);
  body.push('pktdist,size=>1518 value='+points['dist-1519-']);

  var req = {
    url:influxURL,
    operation:'POST',
    headers:{"Content-Type":"text/plain"},
    body:body.join('\n')
  };
  req.error = function(e) {
    logWarning('InfluxDB POST failed, error=' + e);
  }
  try { httpAsync(req); }
  catch(e) {
    logWarning('bad request ' + req.url + ' ' + e);
  }
}

// log metrics to database every 15 seconds
var logStep = 15 * 1000;
var lastIval = 0;
setIntervalHandler(function(now) {
  points = {};

  var bps = flowCount('ix_bytes') * 8;
  points['top-5-memsrc'] = calculateTopN('ix_src',5,1,bps);
  points['top-5-memdst'] = calculateTopN('ix_dst',5,1,bps);
  points['top-5-mempair'] = calculateTopN('ix_pair',5,1,bps);
  points['top-5-protocol'] = calculateTopN('ix_protocol',5,1,bps);
  points['top-5-memunknownsrc'] = calculateTopN('ix_srcmacunknown',5,1,bps);
  points['top-5-memunknowndst'] = calculateTopN('ix_dstmacunknown',5,1,bps);

  points['top-5-indiscards'] = calculateTopInterface('ifindiscards',5);
  points['top-5-outdiscards'] = calculateTopInterface('ifoutdiscards',5);
  points['top-5-inerrors'] = calculateTopInterface('ifinerrors',5);
  points['top-5-outerrors'] = calculateTopInterface('ifouterrors',5);
  points['top-5-inutilization'] = calculateTopInterface('ifinutilization',5);
  points['top-5-oututilization'] = calculateTopInterface('ifoututilization',5);

  // calculate packet size distribution
  var ix0=0,ix64=0,ix65=0,ix128=0,ix256=0,ix512=0,ix1024=0,ix1518=0,ix1519=0,sum=0;
  var res = activeFlows('TOPOLOGY','ix_pktsize',9,0,'edge');
  if(res) {
    for(var i = 0; i < res.length; i++) {
      var value = res[i].value;
      sum += value;
      switch(res[i].key) {
      case 'true,false,false,false,false,false,false,false,false': ix0=value; break;
      case 'false,true,false,false,false,false,false,false,false': ix64=value; break;
      case 'false,false,true,false,false,false,false,false,false': ix65=value; break;
      case 'false,false,false,true,false,false,false,false,false': ix128=value; break;
      case 'false,false,false,false,true,false,false,false,false': ix256=value; break;
      case 'false,false,false,false,false,true,false,false,false': ix512=value; break;
      case 'false,false,false,false,false,false,true,false,false': ix1024=value; break;
      case 'false,false,false,false,false,false,false,true,false': ix1518=value; break;
      case 'false,false,false,false,false,false,false,false,true': ix1519=value; break;
      }
    }
  }  
  var scale = sum ? 100 / sum : 0;
  points['dist-0-63'] = ix0 * scale;
  points['dist-64'] = ix64 * scale;
  points['dist-65-127'] = ix65 * scale;
  points['dist-128-255'] = ix128 * scale;
  points['dist-256-511'] = ix256 * scale;
  points['dist-512-1023'] = ix512 * scale;
  points['dist-1024-1517'] = ix1024 * scale;
  points['dist-1518'] = ix1518 * scale;
  points['dist-1519-'] = ix1519 * scale;

  trend.addPoints(now,points);

  var ival = Math.floor(now/logStep);
  if(ival > lastIval) {
    updateInfluxDB();
    lastIval = ival;
  }

  ageBGP(now);
},1);

function numberMetric(metric) {
  if(metric.hasOwnProperty('metricValue')) return metric.metricValue;
  return -1;
}

function addNodeStats(agent,node) {
  node['agent'] = agent;
  let hostinfo = metric(agent,'2.1.uptime,2.1.cpu_utilization,2.1.mem_utilization,2.1.disk_utilization,2.1.part_max_used');
  node['uptime'] = numberMetric(hostinfo[0]);
  node['cpu_utilization'] = numberMetric(hostinfo[1]);
  node['memory_utilization'] = numberMetric(hostinfo[2]);
  node['disk_utilization'] = numberMetric(hostinfo[3]);
  node['disk_part_utilization'] = numberMetric(hostinfo[4]);
  let ifinfo = dump(agent,'ifindex;ifoperstatus');
  let if_count = 0, if_oper = 0;
  for each (var m in ifinfo) {
    let val = m.metricValue;
    switch(m.metricName) {
      case 'ifindex':
        if_count++;
        break;
      case 'ifoperstatus':
        if('up' !== val) if_oper++;
        break;
    }
  }
  node['interfaces'] = if_count;
  node['oper_down'] = if_oper;
}

function nodeDetails(nodename,agent) {
  var details = {};
  if(agent) {
    let nodeMetrics = {};
    let hostinfo = metric(agent,'2.1.load_one,2.1.load_five,2.1.load_fifteen,2.1.machine_type,2.1.os_release,2.1.os_name,2.1.uuid');
    for each (let h in hostinfo) {
      if(h.hasOwnProperty('metricValue')) nodeMetrics[h.metricName.split('.')[2]] = h.metricValue;
    }
    details['node'] = nodeMetrics;
  }
  var ifinfo = {};
  var dss = [];
  if(agent) {
    let stats = dump(agent,'ifadminstatus;ifoperstatus;ifspeed;ifinoctets;ix_bytes');
    if(stats !== null && stats.length > 0) {
      for(let i = 0; i < stats.length; i++) {
        let ds = stats[i].dataSource;
        let info = ifinfo[ds];
        if(!info) {
          info = {};
          ifinfo[ds] = info;
          dss.push(ds);
        }
        info[stats[i].metricName] = stats[i].metricValue;   
      }
    }
  }
  if(agent && dss.length > 0) {
    let ports = [];
    for(let i = 0; i < dss.length; i++) {
      let rec = topologyInterfaceToPort(agent,dss[i]);
      let pname = rec && rec.port ? rec.port : dss[i];
      let pinfo = {name:pname, ifindex:parseInt(dss[i])};
      let info = ifinfo[dss[i]];
      pinfo['speed'] = info && info.hasOwnProperty('ifspeed') ? info['ifspeed'] : -1;
      pinfo['counters'] = info ? info.hasOwnProperty('ifinoctets') : false;
      pinfo['flows'] = info ? info.hasOwnProperty('ix_bytes') : false;
      pinfo['status'] = info && 'up' === info['ifoperstatus'] ? true : false;
      ports.push(pinfo);
    }
    ports.sort(function(a, b) a.ifindex - b.ifindex );
    details['ports'] = ports;
  }
  return details;
}

function nodes() {
  // information about the status of switches
  var nodes = [];
  var nodeNames = topologyNodeNames(true);
  var agts = {};
  if(nodeNames) {
    for each (let nodename in nodeNames) {
      let node = {name:nodename};
      // need to find a port in order to get to sFlow agent
      let links = topologyNodeLinks(nodename);
      node['link_count'] = links ? links.length : 0;
      let agent = topologyAgentForNode(nodename);
      if(!agent) continue;
      agts[agent] = true;
      addNodeStats(agent,node);
      nodes.push(node);
    }
  }
  return nodes;
}

function links() {
  // information about the status of inter-switch links
  var links = [];
  var linkNames = topologyLinkNames(true);
  if(linkNames) {
    for each (var linkname in linkNames) {
      let rec = topologyLink(linkname);
      let link = {name:linkname};
      link.node1 = rec.node1 || '';
      link.port1 = rec.port1 || '';
      link.node2 = rec.node2 || '';
      link.port2 = rec.port2 || '';
      let metrics = topologyLinkMetric(linkname,'ifadminstatus,ifoperstatus,ifspeed,ifinoctets,ix_bytes');
      if(metrics && metrics.length >= 10) {
        link.statusOK = 'up' === metrics[0].metricValue && 'up' === metrics[1].metricValue && 'up' === metrics[5].metricValue && 'up' === metrics[6].metricValue;
        if(metrics[2].metricValue && metrics[7].metricValue && metrics[2].metricValue === metrics[7].metricValue) {
          link.speed = metrics[2].metricValue;
        } else {
          link.speed = 0;
        }
        link.countersOK = metrics[3].hasOwnProperty('metricValue') && metrics[8].hasOwnProperty('metricValue');
        link.flowsOK = metrics[4].hasOwnProperty('metricValue') && metrics[9].hasOwnProperty('metricValue');
      } else {
        link.statusOK = false;
        link.speed = 0;
        link.countersOK = false;
        link.flowsOK = false;
      }
      links.push(link);
    }
  }
  return links;
}

function findHostLAGs(locs) {
  if(locs.length !== 1) return;

  let entry = locs[0];
  if(!entry.hasOwnProperty('agg_partneropersystemid')) return;

  let partner = entry['agg_partneropersystemid'];
  let t = table('ALL','host_name,ifname,ifindex,agg_attachedaggid',{'agg_partneropersystemid':[partner]});
  if(!t || !t.length) return;

  for each (let r in t) {
    let host = r[0].metricValue;
    let port = r[1].metricValue;
    let ifindex = r[2].metricValue;
    let aggid = r[3].metricValue;
    let agent = r[0].agent;

    // now look up parent for bond name
    let bond = metric(agent,aggid+'.ifname')[0].metricValue;
    if(entry['agent'] === agent) {
      entry['port'] = bond;
      entry['ifindex'] = aggid;
      continue;
    }
   
    let loc = {};
    loc['port'] = bond;
    loc['ouiname'] = entry['ouiname'];
    loc['node'] = host;
    loc['agent'] = agent;
    loc['ifindex'] = aggid;
    loc['vlan'] = entry['vlan'];
    locs.push(loc);
  }
}

function locations() {
  // information about edge facing ports
  var hosts = [];
  var macs = topologyLocatedHostMacs();
  if(!macs) return hosts;

  for each (var mac in macs) {
    let locs = topologyLocateHostMac(mac);
    if(!locs) continue;

    findHostLAGs(locs);
    for each (var loc in locs) {
      let entry = {};
      entry.mac = mac;
      entry['member'] = macToMember[mac] || '';
      entry['ouiname'] = loc.ouiname || '';
      entry['node'] = loc.node || loc.agent;
      entry['port'] = loc.port || loc.ifindex;
      entry['vlan'] = loc.vlan || '';
      hosts.push(entry);
    }
  }
  return hosts;
}

setFlowHandler(function(flow) {
  switch(flow.name) {
  case 'ix_ip4':
  case 'ix_ip6':
    let [mmac,member] = flow.flowKeys.split(SEP);
    let macMem = macToMember[mmac];
    if(macMem) {
      if(member !== macMem) {
        sendWarning({ix_evt:"assignment", mac:mmac, assigned:macMem, seen:member});
      }
    } else {
      sendWarning({ix_evt:"missing", mac:mmac, member:member});
    } 
    break;
  case 'ix_badprotocol':
    let [smac,ethtype] = flow.flowKeys.split(SEP);
    sendWarning({ix_evt:"protocol", "mac":smac, "ethtype":ethtype});
    break;
  case 'ix_bgp':
    let [mem1,mem2] = flow.flowKeys.split(SEP);
    let bgpkey = mem1 > mem2 ? mem2+SEP+mem1 : mem1+SEP+mem2;
    bgp[bgpkey] = flow.start;
    break;
  }
},['ix_badprotocol','ix_ip4','ix_ip6','ix_bgp']);

setHttpHandler(function(req) {
  var result, i, key, name, path = req.path;
  if(!path || path.length == 0) throw "not_found";
     
  switch(path[0]) {
    case 'trend':
      if(path.length > 1) throw "not_found"; 
      result = {};
      result.trend = req.query.after ? trend.after(parseInt(req.query.after)) : trend;
      break;
    case 'metric':
      if(path.length == 1) result = points;
      else {
        if(path.length != 2) throw "not_found";
        if(points.hasOwnProperty(path[1])) result = points[path[1]];
        else throw "not_found";
      }
      break;
    case 'locations':
      if(path.length > 1) throw "not_found";
      result = locations();
      break;
    case 'matrix':
      if(path.length > 1) throw "not_fount";
      result = [];
      var res = activeFlows('TOPOLOGY','ix_pair',1000,0,'edge');
      if(res) {
        for(i = 0; i < res.length; i++) {
           var [src,dst] = res[i].key.split(SEP);
           result.push({src:src,dst:dst,bps:res[i].value*8});
        }
      }
      break;
    case 'topology':
      if(path.length > 1) {
        if(path.length === 2 && 'info' === path[1]) {
          let nodeNames = topologyNodeNames();
          let linkNames = topologyLinkNames();
          result = {
            nodes:nodeNames ? nodeNames.length : 0,
            links:linkNames ? linkNames.length : 0
          };
        }
        else throw "not_found";
      } else {
        switch(req.method) {
          case 'POST':
          case 'PUT':
            if(req.error) throw "bad_request";
            if(!setTopology(req.body)) throw "bad_request";
            storeSet('topology',req.body);
            break;
          case 'GET':
            result = getTopology();
            break;
          default:
            throw "bad_request";
        }
      }
      break;
    case 'nodes':
      if(path.length > 1) throw "not_found";
      result = nodes();
      break;
    case 'node':
      if(path.length !== 2) throw 'not_found';
      let nodename = path[1];
      let agent = req.query ? req.query.agent : null;
      result = nodeDetails(nodename,agent);
      break;
    case 'links':
      if(path.length > 1) throw "not_found";
      result = links();
      break;
    case 'bgp':
      result = {};
      for(var mems in bgp) {
        let [mem1,mem2] = mems.split(SEP);
        if(!result[mem1]) result[mem1] = [];
        if(!result[mem2]) result[mem2] = [];
        result[mem1].push(mem2);
        result[mem2].push(mem1);
      }
      break;
    case 'members':
      if(path.length > 1) {
        if(path.length === 2 && 'info' === path[1]) {
          result = {
            numMembers:numMembers,
            numMacs:numMacs
          };
        }
        else throw "not_found";
      } else {
        switch(req.method) {
          case 'POST':
          case 'PUT':
            if(req.error) throw "bad_request";
            members = req.body;
            updateMemberInfo();
            storeSet('members',req.body);
            break;
          case 'GET':
            result = members;
            break;
          default:
            throw "bad_request";
        }
      }
      break;
    default: throw 'not_found';
  } 
  return result;
});

