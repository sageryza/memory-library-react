import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  return (
    <div className="home-container">
      <header className="home-header">
        <div className="header-content">
          <h1>Memory Library</h1>
          <p className="subtitle">tools for the mind</p>
        </div>
      </header>

      <main className="modules-grid">
        {/* Archive Module */}
        <Link to="/archive" className="module-card" data-module="archive">
          <div className="module-icon">
            <div className="archive-icon">
              <div className="bookshelf">
                <div className="book book1"></div>
                <div className="book book2"></div>
                <div className="book book3"></div>
                <div className="book book4"></div>
              </div>
            </div>
          </div>
          <h3>Archive</h3>
          <p>Browse all memories in a searchable, filterable library. Perfect for finding specific moments or themes.</p>
          <div className="module-features">
            <span className="feature">Search</span>
            <span className="feature">Filter</span>
            <span className="feature">Browse</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Archive</button>
        </Link>

        {/* Conspiracy Board Module */}
        <Link to="/conspiracy-board" className="module-card" data-module="conspiracy">
          <div className="module-icon">
            <div className="conspiracy-icon">
              <div className="pushpin">
                <div className="pin-head"></div>
                <div className="pin-body"></div>
                <div className="pin-shadow"></div>
              </div>
            </div>
          </div>
          <h3>Conspiracy Board</h3>
          <p>Connect the dots with notes and red strings on a corkboard. Build webs of connections, theories, and revelations.</p>
          <div className="module-features">
            <span className="feature">Pin & Connect</span>
            <span className="feature">Red Strings</span>
            <span className="feature">Visual Links</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Conspiracy Board</button>
        </Link>

        {/* Chronology Module */}
        <Link to="/chronology" className="module-card" data-module="timeline">
          <div className="module-icon">
            <div className="timeline-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 393.04 545.92" width="60" height="60">
                <path fill="#800020" d="M381.55,501.79c7.47,2.16,11.39,7.23,11.46,15.95,.04,4.33,.05,8.67-.02,13-.17,9.41-5.97,15.18-15.33,15.18-120.81,0-241.63,0-362.44-.02-8.24,0-13.79-3.91-14.69-11.81-.77-6.69-.16-13.58,.34-20.34,.37-5.03,3.53-9.06,8.05-10.56,5.12-1.7,5.51-5.17,6.03-9.39,1.51-12.33,2.81-24.72,5.01-36.94,6.51-36.15,21.44-68.77,42.38-98.79,17.42-24.97,38.84-46.43,59.57-68.51,3.17-3.38,6.26-6.95,8.75-10.85,4.98-7.8,4.94-13.47-1.1-20.56-8.19-9.62-16.9-18.83-25.72-27.88-26.7-27.41-50.68-56.76-66.96-91.77-12.14-26.11-19.09-53.58-21.92-82.16-.26-2.64-.38-5.34-1.05-7.89-.34-1.3-1.55-2.88-2.75-3.36C3.87,42.18,.31,37.51,.07,29.61c-.13-4.33-.03-8.66,0-13C.15,5.76,5.93,0,16.73,0c40.66,0,81.32,0,121.98,0,79.15,0,158.31,0,237.46,0,9.22,0,14.89,3.14,15.97,10.95,1.08,7.76,.96,15.96-.36,23.67-.63,3.65-4.77,7.46-8.28,9.61-3.05,1.87-4.21,3.7-4.46,6.88-2.27,29.13-8.68,57.29-20.48,84.06-9.63,21.85-22.01,42.18-37.71,60.15-17.85,20.43-36.58,40.08-54.92,60.08-8.49,9.26-8.95,18.12-.53,27.42,11.18,12.33,22.79,24.27,34.33,36.27,34.22,35.58,60.1,76.07,71.54,124.58,4.43,18.81,6.81,38.11,10.29,58.11Zm-38.41-1.04c-2.28-14.48-4.01-28.44-6.74-42.2-8.62-43.47-30.72-79.78-60.25-112.11-12.46-13.64-24.69-27.49-36.59-41.62-8.6-10.2-14.39-21.85-14.55-35.66-.17-14.29,6.15-26.12,14.95-36.52,14.61-17.28,29.93-33.96,44.81-51.01,24.39-27.92,42.78-59.11,50.73-95.7,2.79-12.87,4.64-25.94,6.99-39.34H52.3c-.63,9.25,4.95,39.19,9.43,53.54,10.37,33.23,29.81,60.91,52.52,86.6,13.56,15.34,27.62,30.24,40.83,45.86,18.42,21.79,18.74,47.12,.69,69.01-14.92,18.09-30.81,35.39-46.11,53.17-13.91,16.18-26.26,33.44-35.69,52.69-10.37,21.17-16.27,43.68-19.83,66.84-1.33,8.63-1.85,17.38-2.77,26.44H343.14Z"/>
                <path fill="#800020" d="M299.39,133.89c-3.73,5.26-6.59,10.12-10.23,14.29-17.74,20.31-35.54,40.56-53.6,60.58-16.8,18.61-28.91,39.61-34.31,64.24-.42,1.92-.34,3.97-.3,5.96,.28,13.14,.73,26.28,.9,39.42,.15,11.94,6.78,20.26,14.48,28.47,18.11,19.3,36.21,38.65,53.52,58.66,16.82,19.44,30.6,40.94,38.99,65.52,.8,2.35,1.66,4.71,2.11,7.13,.42,2.27,.32,4.64,.47,7.35H82.35c.74-4.43,.9-8.78,2.22-12.76,7.78-23.55,20.91-44.11,36.98-62.69,19.07-22.03,38.71-43.58,58.38-65.08,5.64-6.17,9.16-13.3,10.61-21.11,2.03-10.93,3.18-22.07,3.96-33.18,1.15-16.53-4.49-31.7-10.94-46.5-6.39-14.66-16.42-26.86-27.17-38.52-19.51-21.17-39.63-41.82-56.45-65.32-1.34-1.87-2.49-3.87-4.14-6.46h203.59Z"/>
              </svg>
            </div>
          </div>
          <h3>Chronology</h3>
          <p>Organize memories chronologically on an interactive timeline. Drag and drop events, explore connections over time.</p>
          <div className="module-features">
            <span className="feature">Chronological</span>
            <span className="feature">Drag & Drop</span>
            <span className="feature">Interactive</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Chronology</button>
        </Link>

        {/* Libraries Module */}
        <Link to="/libraries" className="module-card" data-module="libraries">
          <div className="module-icon">
            <div className="library-icon">
              <svg viewBox="0 0 461.11 423.49" width="60" height="60">
                <path fill="#800020" d="M408.07,242.82c0,25.5,.2,51-.1,76.5-.12,10.84,4.71,16.16,14.69,15.37,2.73-.22,5.59,.72,8.33,1.39,3.9,.95,5.9,3.66,5.97,7.62,.1,6.5,.03,13,.06,19.5,.02,3.58-1.91,5.11-5.29,5.18-1.67,.03-3.33,.07-5,.07-49.66,0-99.33,.05-148.99-.04-14.47-.03-28.93-.72-43.4-.69-20.48,.04-40.97,.65-61.45,.7-45.83,.11-91.66,.04-137.49,.02-2.33,0-4.89,.4-6.92-.43-1.77-.72-4.05-2.84-4.16-4.48-.47-6.6-.34-13.26-.14-19.88,.15-4.9,3.02-7.54,7.89-8.05,3.15-.33,6.28-.81,9.44-1.01,9.04-.58,11.63-3.26,11.64-12.5,.02-41.17,.01-82.33,.01-123.5,0-11.17-.42-22.35,.12-33.49,.6-12.49-6.2-14.31-15.91-14.3-4.47,0-8.96,.06-13.4-.42-6.1-.65-8.48-3.58-9.7-9.62-2.21-11.02,3.42-17.58,12.1-22.72,17.77-10.53,35.48-21.18,53.26-31.69,32.56-19.25,65.14-38.45,97.73-57.65,14.21-8.37,28.64-16.39,42.6-25.16,7.82-4.91,14.68-4.55,22.32,.09,16.8,10.2,33.84,20.02,50.78,29.98,32.03,18.82,64.08,37.61,96.08,56.47,16.07,9.47,32.06,19.1,48.1,28.62,10.7,6.35,13.83,13.55,10.34,25.53-.62,2.12-3.11,4.62-5.21,5.18-3.94,1.06-8.22,.86-12.36,1.11-1.66,.1-3.33,0-5,.03-14.06,.36-16.91,3.26-16.91,17.27,0,25,0,50,0,75ZM231.05,121.54c46.16,0,92.32,.02,138.48-.08,1.88,0,3.76-1.25,5.64-1.91-1.28-1.4-2.51-2.84-3.87-4.17-.58-.57-1.41-.88-2.12-1.31-19.24-11.65-38.48-23.29-57.71-34.95-24.65-14.94-49.31-29.86-73.92-44.86-4.26-2.6-7.92-2.72-12.45,.02-44.16,26.78-88.46,53.31-132.67,80.01-2.11,1.28-3.68,3.46-5.5,5.22,2.54,.68,5.08,1.94,7.63,1.94,45.49,.12,90.99,.09,136.48,.08ZM89.03,242.01c0,12.5,0,25,0,37.49,0,14.16-.07,28.33,.06,42.49,.06,7.08,3.49,11.27,9.96,11.37,16.66,.27,33.33,.25,49.99,0,5.82-.08,9.18-3.47,10.06-9.25,.58-3.77,.9-7.62,.9-11.43,.06-46.16,.06-92.32,0-138.48,0-3.98-.33-7.98-.78-11.94-.94-8.18-3.82-10.78-11.97-10.82-14.66-.06-29.33-.03-43.99-.01-11.46,.01-14.2,2.71-14.21,14.07-.02,25.5,0,50.99,0,76.49Zm106.99-.14c0,25.31-.01,50.62,0,75.94,0,12.7,3.02,15.74,15.5,15.75,13.66,0,27.31,.04,40.97-.01,10.09-.04,13.57-3.4,13.58-13.51,.05-51.96,.05-103.91,0-155.87,0-8.98-4.28-13.09-13.28-13.04-14.32,.07-28.64,.22-42.95,.32-10.97,.07-13.8,2.87-13.81,14-.03,25.48,0,50.96,0,76.44Zm176.07,.25c0-24.82,0-49.63-.01-74.45,0-2.16,.04-4.35-.26-6.48-.97-6.86-4.07-9.67-10.96-9.71-15.82-.08-31.64-.08-47.47,0-7.02,.04-10.01,2.69-11.06,9.6-.32,2.13-.29,4.32-.29,6.48-.01,50.13-.01,100.26,0,150.39,0,1.83-.05,3.67,.12,5.49,.54,5.57,4.48,9.86,10.05,9.94,16.48,.22,32.97,.2,49.46,.03,5.27-.05,8.59-3.15,9.7-8.41,.54-2.58,.68-5.28,.69-7.93,.05-24.98,.03-49.96,.03-74.95Z"/>
                <path fill="#800020" d="M230.06,423.48c-70.98,0-141.95,0-212.93,0-12.53,0-16.58-4.27-17.07-16.74-.56-14.36,1.92-22.41,22.07-22.35,139.93,.38,279.86,.2,419.79,.21,2.66,0,5.36-.09,7.98,.32,6.9,1.06,10.96,5.73,11.12,12.61,.1,4.33,.13,8.67-.03,12.99-.3,7.79-5.16,12.55-13.01,12.93-1.5,.07-3,.04-4.5,.04-71.14,0-142.28,0-213.43,0Z"/>
              </svg>
            </div>
          </div>
          <h3>Libraries</h3>
          <p>Discover patterns and clusters in your connected memories. Explore constellations of related thoughts and ideas.</p>
          <div className="module-features">
            <span className="feature">Pattern Discovery</span>
            <span className="feature">Memory Clusters</span>
            <span className="feature">Collections</span>
          </div>
          <button className="launch-btn" onClick={(e) => e.preventDefault()}>Launch Libraries</button>
        </Link>

        {/* Lessons Module */}
        <div className="module-card coming-soon" data-module="lessons">
          <div className="module-icon">
            <div className="lessons-icon">
              <div className="book-open">
                <div className="page-left"></div>
                <div className="page-right">
                  <div className="text-line"></div>
                  <div className="text-line"></div>
                  <div className="text-line"></div>
                </div>
                <div className="book-spine"></div>
              </div>
            </div>
          </div>
          <h3>Lessons</h3>
          <p>Guided exercises and lessons to help you explore memory patterns, understand recall, and develop new perspectives.</p>
          <div className="module-features">
            <span className="feature">Guided Learning</span>
            <span className="feature">Memory Exercises</span>
            <span className="feature">Pattern Discovery</span>
          </div>
          <button className="launch-btn coming-soon" disabled>Coming Soon</button>
        </div>
      </main>
    </div>
  );
}

export default Home;
