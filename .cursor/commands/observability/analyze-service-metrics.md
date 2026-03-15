# Analyze Service Metrics

## Overview

Analyze service metrics using Datadog and Coralogix to identify performance issues, anomalies, and optimization opportunities.

## Steps

1. **Query metrics from Datadog (APM, custom metrics, infrastructure)**
   - Access Datadog dashboard
   - Query APM metrics (latency, error rate, throughput)
   - Query custom application metrics
   - Review infrastructure metrics (CPU, memory, network)

2. **Search logs in Coralogix for error patterns**
   - Access Coralogix dashboard
   - Search for error logs and exceptions
   - Identify error patterns and frequencies
   - Correlate errors with time periods

3. **Correlate metrics with logs and traces**
   - Link Datadog traces with Coralogix logs using trace IDs
   - Correlate metric spikes with log events
   - Identify root causes from trace data
   - Map errors to specific code paths

4. **Identify anomalies and trends**
   - Compare current metrics with historical baselines
   - Identify unusual patterns or spikes
   - Detect gradual degradation trends
   - Flag performance regressions

5. **Correlate with code changes and deployments**
   - Check deployment history around metric changes
   - Review recent code changes
   - Identify which changes caused issues
   - Check ArgoCD deployment timeline

6. **Identify root causes**
   - Analyze trace data for slow operations
   - Review error logs for patterns
   - Check resource utilization metrics
   - Identify bottlenecks

7. **Propose optimizations**
   - Suggest code optimizations
   - Recommend infrastructure changes
   - Propose caching strategies
   - Suggest database query optimizations

8. **Set up additional monitoring/alerts if needed**
   - Create new metrics if gaps identified
   - Set up alerts for identified issues
   - Configure dashboards for new insights
   - Document monitoring improvements

## Metrics Analysis Checklist

- [ ] Metrics queried from Datadog
- [ ] Logs searched in Coralogix
- [ ] Metrics correlated with logs and traces
- [ ] Anomalies and trends identified
- [ ] Correlated with code changes and deployments
- [ ] Root causes identified
- [ ] Optimizations proposed
- [ ] Additional monitoring/alerts set up (if needed)

## Related Commands

- [setup-monitoring.md](setup-monitoring.md)
- [debug-kubernetes.md](debug-kubernetes.md)
- [optimize-performance.md](optimize-performance.md)
