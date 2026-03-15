# Setup Monitoring

## Overview

Set up monitoring, metrics, and alerting for a service using Coralogix (logs) and Datadog (metrics/APM).

## Steps

1. **Identify monitoring needs (metrics, logs, traces)**
   - Determine what to monitor (application metrics, business metrics)
   - Identify log sources and formats
   - Plan distributed tracing needs
   - Define SLIs and SLOs

2. **Configure Coralogix integration (log shipping, structured logging)**
   - Set up Coralogix account and API key
   - Configure log shipping agent or SDK
   - Set up structured logging format (JSON)
   - Configure log parsing rules in Coralogix
   - Set up log retention policies

3. **Configure Datadog integration (metrics, APM, custom metrics)**
   - Set up Datadog account and API key
   - Install Datadog agent (if needed) or use SDK
   - Configure APM for distributed tracing
   - Set up custom metrics collection
   - Configure service tags and metadata

4. **Set up structured logging compatible with Coralogix**
   - Use structured logging library (e.g., structlog for Python, winston for Node.js)
   - Format logs as JSON
   - Include correlation IDs and trace IDs
   - Add contextual information (user ID, request ID, etc.)
   - Ensure log levels are appropriate

5. **Configure distributed tracing (Datadog APM)**
   - Instrument application with Datadog APM
   - Set up trace sampling
   - Configure trace context propagation
   - Add custom spans for important operations
   - Link traces with logs using trace IDs

6. **Create dashboards (Datadog dashboards)**
   - Create service overview dashboard
   - Add key metrics (latency, error rate, throughput)
   - Create log analysis dashboard in Coralogix
   - Set up correlation between metrics and logs
   - Add deployment markers

7. **Set up alerts in Datadog/Coralogix**
   - Configure alert thresholds for key metrics
   - Set up log-based alerts in Coralogix
   - Configure alert notifications (Slack, PagerDuty, email)
   - Set up alert escalation policies
   - Test alert delivery

8. **Document monitoring setup and query examples**
   - Document how to query logs in Coralogix
   - Document how to query metrics in Datadog
   - Provide example queries for common issues
   - Document alert definitions
   - Create runbook for common alerts

## Monitoring Setup Checklist

- [ ] Monitoring needs identified
- [ ] Coralogix integration configured
- [ ] Datadog integration configured
- [ ] Structured logging set up
- [ ] Distributed tracing configured
- [ ] Dashboards created
- [ ] Alerts set up
- [ ] Documentation created

## Related Commands

- [analyze-service-metrics.md](analyze-service-metrics.md)
- [debug-kubernetes.md](debug-kubernetes.md)
