'use strict';
const Fs = require('fs');
const D3 = require('d3');
const D3Node = require('d3-node');

const styles = `
.current {
  fill: #5fa04e;
}
.active {
  fill: #229ad6;
}
.maintenance {
  fill: #b1bcc2;
}
.unstable {
  fill: #e99c40;
}
.bar-join {
  fill: #ffffff;
}
.bar-join.unstable, .bar-join.current {
  display: none;
}
.tick text {
  font: 16px sans-serif;
  fill: #89a19d;
}
.axis--y .tick text {
  text-anchor: end;
}
.label {
  fill: #fff;
  font: 15px sans-serif;
  font-weight: 100;
  text-anchor: start;
  dominant-baseline: middle;
  text-transform: uppercase;
}
.rotated-label {
  fill: #fff;
  font: 10px sans-serif;
  text-anchor: start;
  dominant-baseline: middle;
  text-transform: uppercase;
}`;



function parseInput (data, queryStart, queryEnd, excludeMaster, projectName) {
  const output = [];

  Object.keys(data).forEach((v) => {
    const version = data[v];
    const name = `${projectName} ${v.replace('v', '')}`;
    const current = version.start ? new Date(version.start) : null;
    const active = version.lts ? new Date(version.lts) : null;
    const maint = version.maintenance ? new Date(version.maintenance) : null;
    const releases = version.releases ? version.releases : {};
    let end = version.end ? new Date(version.end) : null;

    if (current === null) {
      throw new Error(`missing start in ${version}`);
    }

    if (end === null) {
      throw new Error(`missing end in ${version}`);
    }

    if (maint !== null) {
      if (maint < queryEnd && end > queryStart) {
          output.push({ name, type: 'maintenance', label: 'maintenance', start: maint, end });
      }

      end = maint;
    }

    if (active !== null) {
      if (active < queryEnd && end > queryStart) {
          output.push({ name, type: 'active', label: 'active', start: active, end });
      }

      end = active;
    }

    if (current < queryEnd && end > queryStart) {
	output.push({ name, type: 'current', label: 'current', start: current, end });
    }
    Object.keys(releases).forEach((r) => {
      const version = releases[r];
      const current = version.start ? new Date(version.start) : null;
      const type = version.type ? version.type : "active";
      let end = version.end ? new Date(version.end) : null;
      if (current < queryEnd && end > queryStart) {
          output.push({ name, type: type, label: r, start: current, end });
      }
    });
  });

  if (!excludeMaster) {
    output.unshift({
      name: 'Master',
      type: 'unstable',
      start: queryStart,
      end: queryEnd
    });
  }

  return output;
}


function create (options) {
  const { queryStart, queryEnd, html, svg: svgFile, png, animate, excludeMaster, projectName, margin: marginInput } = options;
  const data = parseInput(options.data, queryStart, queryEnd, excludeMaster, projectName);
  const d3n = new D3Node({ svgStyles: styles, d3Module: D3 });
  const margin = marginInput || { top: 30, right: 30, bottom: 30, left: 160 };
  const width = 1600 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;
  const xScale = D3.scaleTime()
                   .domain([queryStart, queryEnd])
                   .range([0, width])
                   .clamp(true);
  const yScale = D3.scaleBand()
                   .domain(data.map((data) => { return data.name; }))
                   .range([0, height])
                   .padding(0.3);
  const xAxis = D3.axisBottom(xScale)
                  .tickSize(height)
                  .tickFormat(D3.timeFormat('%b %Y'));
  const yAxis = D3.axisRight(yScale).tickSize(width);
  const svg = d3n.createSVG()
                 .attr('width', width + margin.left + margin.right)
                 .attr('height', height + margin.top + margin.bottom)
                 .append('g')
                 .attr('id', 'bar-container')
                 .attr('transform', `translate(${margin.left}, ${margin.top})`);


  function needRotateLabel(data) {
    const min = data.label.length * 10;
    return (calculateWidth(data) >= min) ? false : true;
  }

  function calculateWidth (data) {
    return xScale(data.end) - xScale(data.start);
  }

  function calculateHeight (data) {
    return yScale.bandwidth();
  }

  function customXAxis (g) {
    g.call(xAxis);
    g.select('.domain').remove();
    g.selectAll('.tick:nth-child(odd) line').attr('stroke', '#89a19d');
    g.selectAll('.tick:nth-child(even) line')
     .attr('stroke', '#89a19d')
     .attr('stroke-dasharray', '2,2');
    g.selectAll('.tick text').attr('y', 0).attr('dy', -10);
  }

  function customYAxis (g) {
    g.call(yAxis);
    g.select('.domain').remove();
    g.selectAll('.tick line').attr('stroke', '#e1e7e7');
    g.selectAll('.tick text').attr('x', 0).attr('dx', -10);
    g.append('line')
     .attr('y1', height)
     .attr('y2', height)
     .attr('x2', width)
     .attr('stroke', '#89a19d');
  }

  svg.append('g')
     .attr('class', 'axis axis--x')
     .call(customXAxis);

  svg.append('g')
     .attr('class', 'axis axis--y')
     .call(customYAxis);

  const bar = svg.selectAll('#bar-container').data(data).enter().append('g');

  const rect = bar.append('rect')
                  .attr('class', (data) => { return `bar ${data.type}`; })
                  .attr('x', (data) => { return xScale(data.start); })
                  .attr('y', (data) => { return yScale(data.name); })
                  .attr('width', calculateWidth)
                  .attr('height', calculateHeight);

  if (animate === true) {
    rect.append('animate')
        .attr('attributeName', 'width')
        .attr('from', 0)
        .attr('to', calculateWidth)
        .attr('dur', '1s');
  }

  bar.append('rect')
     .attr('class', (data) => { return `bar-join ${data.type}`; })
     .attr('x', (data) => { return xScale(data.start) - 1; })
     .attr('y', (data) => { return yScale(data.name); })
     .attr('width', 2)
     .attr('height', calculateHeight)
     .style('opacity', (data) => {
       // Hack to hide on current and unstable
       if ((data.type === 'unstable' || data.type === 'current') ||
           xScale(data.start) <= 0) {
         return 0;
       }

       return 1;
     });

  bar.append('text')
	.attr('class', (data) => {
	    return needRotateLabel(data) ? 'rotated-label' : 'label';
	})
	.classed('rotation', (data) => {
	    return needRotateLabel(data)
	})
	.attr('transform', (data,i)=>{
	    if (needRotateLabel(data)) {
		return 'translate( '+xScale(data.start)+' , '+ (yScale(data.name) + (calculateHeight(data) / 2) + 2) +'),'+ 'rotate(90)';
	    } else { return ''; }
	})
	.attr('x', (data) => {
	    if (!needRotateLabel(data)) {
		return xScale(data.start) + 10;
	    } else { return -20; }
     })
	.attr('y', (data) => {
	    if (!needRotateLabel(data)) {
		// + 2 is a small correction so the text fill is more centered.
		return yScale(data.name) + (calculateHeight(data) / 2) + 2;
	    } else { return -10; }
     })
	.text((data) => { return data.label; });

  if (typeof html === 'string') {
    Fs.writeFileSync(html, d3n.html());
  }

  if (typeof svgFile === 'string') {
    Fs.writeFileSync(svgFile, d3n.svgString());
  }

  if (typeof png === 'string') {
    const Svg2png = require('svg2png'); // Load this lazily.

    Fs.writeFileSync(png, Svg2png.sync(Buffer.from(d3n.svgString())));
  }
}

module.exports.create = create;
